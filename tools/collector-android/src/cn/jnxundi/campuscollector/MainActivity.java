package cn.jnxundi.campuscollector;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import org.json.JSONObject;
import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int GREEN = Color.rgb(22, 132, 94), INK = Color.rgb(28, 44, 37), MUTED = Color.rgb(91, 111, 101);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private TrackStore store;
    private TextView status, detail;
    private Button start, pause, stop, export;
    private final List<Button> markers = new ArrayList<>();
    private long session;
    private File exportFile;
    private boolean exporting;
    private final Runnable refresh = new Runnable() {
        @Override public void run() { render(); handler.postDelayed(this, 2000); }
    };

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        store = new TrackStore(this);
        if (saved != null && saved.getString("export_file") != null) exportFile = new File(saved.getString("export_file"));
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout root = column();
        root.setFocusableInTouchMode(true);
        root.requestFocus();
        root.setPadding(dp(20), dp(12), dp(20), dp(24));
        scroll.addView(root);
        scroll.setOnApplyWindowInsetsListener((v, insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });
        setContentView(scroll);
        title(root, "校园采集", 26);
        text(root, "一天实地记录 · 仅保存在这台手机", 14, MUTED);
        LinearLayout stateCard = card(root);
        status = text(stateCard, "尚未开始", 20, GREEN);
        status.setTypeface(null, Typeface.BOLD);
        detail = text(stateCard, "", 14, MUTED);
        LinearLayout controls = row(root);
        start = button(controls, "开始采集", () -> startRecording());
        pause = button(controls, "暂停", () -> send(RecorderService.PAUSE));
        stop = button(root, "结束并保存", () -> new AlertDialog.Builder(this).setTitle("结束这次采集？")
            .setMessage("已记录的数据保留在手机，可稍后导出。再次开始会新建一次采集。")
            .setNegativeButton("继续记录", null).setPositiveButton("结束并保存", (d, w) -> send(RecorderService.STOP)).show());
        title(root, "到地方时，顺手记一下", 17);
        text(root, "标记会附上最近定位及其时间差；室内定位弱时，请在备注写清楼栋、楼层、方向。", 13, MUTED);
        LinearLayout first = row(root);
        markButton(first, "入口 / 出口", "入口 / 出口");
        markButton(first, "停好车了", "停车");
        LinearLayout second = row(root);
        markButton(second, "取车出发", "取车");
        markButton(second, "教室 / 楼梯", "教室 / 楼梯 / 楼层");
        LinearLayout modes = row(root);
        markers.add(button(modes, "出行方式", this::travelMode));
        markers.add(button(modes, "其他备注", () -> note("备注")));
        LinearLayout sampling = card(root);
        title(sampling, "采集节奏", 17);
        text(sampling, "默认 10 秒 / 5 米。停留时减少 GPS，检测到走动后恢复。进出楼和窄路可临时细采集。", 13, MUTED);
        LinearLayout samplingRow = row(sampling);
        markers.add(button(samplingRow, "上课 / 停留", () -> send(RecorderService.REST)));
        markers.add(button(samplingRow, "继续赶路", () -> send(RecorderService.WALK)));
        markers.add(button(sampling, "细采集 5 分钟", () -> send(RecorderService.DETAIL)));
        export = button(root, "导出数据 / 历史记录", this::history);
        button(root, "定位与电池设置", this::settings);
        text(root, "明天：出门前开始 → 正常锁屏使用 → 进楼、停车时标记 → 回来结束并导出。请保留常驻通知，避免强行停止、重启手机或清理应用数据。", 13, MUTED);
        text(root, "GPS 不能确定室内楼层或教室结构。耗电需实测；电量记录包含整机使用，边充电边测试不能代表全天耗电。", 12, MUTED);
    }

    @Override protected void onResume() { super.onResume(); handler.removeCallbacks(refresh); handler.post(refresh); }
    @Override protected void onPause() { handler.removeCallbacks(refresh); super.onPause(); }
    @Override protected void onDestroy() { handler.removeCallbacks(refresh); store.close(); io.shutdown(); super.onDestroy(); }
    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (exportFile != null) out.putString("export_file", exportFile.getAbsolutePath());
    }

    private void render() {
        try {
            session = store.latestSession();
            String state = store.state(session);
            boolean running = RecorderService.isRunning();
            boolean active = state.equals("recording"), paused = state.equals("paused");
            JSONObject info = store.summary(session);
            status.setText(active ? (running ? "正在记录" : "记录中断 · 点击继续") : paused ? "已暂停" : session == 0 ? "准备好就出发" : "已结束 · 数据已保存");
            String age = info.has("age_s") ? (info.optLong("age_s") < 0 ? "重启前的定位" : info.optLong("age_s") + " 秒前") : "尚未获得定位";
            String accuracy = info.isNull("accuracy_m") || !info.has("accuracy_m") ? "—" : String.format(Locale.CHINA, "±%.0f 米", info.optDouble("accuracy_m"));
            String error = getSharedPreferences("collector", MODE_PRIVATE).getString("error", "");
            detail.setText("原始点 " + info.optInt("points") + "  ·  可用点 " + info.optInt("usable_points") + "  ·  事件 " + info.optInt("events")
                + "\n最近精度 " + accuracy + " · " + age + "\n" + (running ? RecorderService.phase() : active ? "后台服务未运行，请重新开始以继续本次记录。" : "数据不会因关闭页面而删除。")
                + (active && info.optLong("age_s", 999) > 90 ? "\n定位较久未更新；室内可选停留，到室外再检查。" : "")
                + (!error.isEmpty() ? "\n上次错误：" + error : ""));
            start.setText(paused || (active && !running) ? "继续采集" : "开始采集");
            start.setEnabled(!active || !running);
            pause.setEnabled(active && running);
            stop.setEnabled(active || paused);
            for (Button marker : markers) marker.setEnabled(active && running);
            export.setEnabled(session != 0 && !exporting);
        } catch (RuntimeException | org.json.JSONException e) { detail.setText("读取状态失败：" + e.getMessage()); }
    }

    private void startRecording() {
        List<String> missing = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            missing.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) missing.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!missing.isEmpty()) { requestPermissions(missing.toArray(new String[0]), 1); return; }
        if (!getSystemService(android.location.LocationManager.class).isLocationEnabled()) {
            new AlertDialog.Builder(this).setMessage("请先打开手机的系统定位。").setPositiveButton("打开设置", (d, w) -> startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))).setNegativeButton("稍后", null).show();
            return;
        }
        getSharedPreferences("collector", MODE_PRIVATE).edit().remove("error").apply();
        startForegroundService(new Intent(this, RecorderService.class).setAction(RecorderService.START));
        handler.postDelayed(this::render, 300);
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == 1) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) startRecording();
            else new AlertDialog.Builder(this).setTitle("需要定位和通知权限")
                .setMessage("请选择精确位置，并允许通知，以便锁屏时检查采集状态。可以在应用设置中修改。")
                .setNegativeButton("稍后", null).setPositiveButton("应用设置", (d, w) -> appSettings()).show();
        }
    }

    private void send(String action) {
        startService(new Intent(this, RecorderService.class).setAction(action));
        handler.postDelayed(this::render, 200);
    }

    private void markButton(LinearLayout parent, String label, String kind) { markers.add(button(parent, label, () -> note(kind))); }
    private void note(String kind) {
        EditText input = new EditText(this);
        input.setHint("例如：某楼东门 / 6层西侧607 / 车棚北边");
        input.setContentDescription("实地标记备注");
        input.setMinLines(2);
        input.setMaxLines(5);
        input.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(1000)});
        new AlertDialog.Builder(this).setTitle(kind).setView(input).setNegativeButton("取消", null)
            .setPositiveButton("记下此刻", (d, w) -> {
                // Timestamp the actual confirmation; no saved position is presented as a surveyed entrance.
                startService(new Intent(this, RecorderService.class).setAction(RecorderService.MARK).putExtra("note", kind + "：" + input.getText().toString().trim()));
                Toast.makeText(this, "已记录", Toast.LENGTH_SHORT).show();
            }).show();
    }

    private void travelMode() {
        String[] modes = {"步行", "骑行", "校园公车", "室内 / 楼梯", "下雨", "拥挤 / 排队"};
        new AlertDialog.Builder(this).setTitle("记录当前情况").setItems(modes, (d, which) ->
            startService(new Intent(this, RecorderService.class).setAction(RecorderService.MARK).putExtra("note", modes[which]))).show();
    }

    private void history() {
        List<Long> ids = new ArrayList<>();
        List<String> rows = new ArrayList<>();
        SimpleDateFormat date = new SimpleDateFormat("MM-dd HH:mm", Locale.CHINA);
        try (Cursor c = store.getReadableDatabase().rawQuery("SELECT id,started_ms,state,(SELECT count(*) FROM points p WHERE p.session_id=s.id) FROM sessions s ORDER BY id DESC", null)) {
            while (c.moveToNext()) {
                ids.add(c.getLong(0));
                String state = c.getString(2);
                rows.add("#" + c.getLong(0) + "  " + date.format(new Date(c.getLong(1))) + "  " + c.getLong(3) + " 点 · " + (state.equals("stopped") ? "已结束" : state.equals("paused") ? "暂停" : "记录中"));
            }
        }
        new AlertDialog.Builder(this).setTitle("选择要导出的采集").setItems(rows.toArray(new String[0]), (d, which) -> {
            long selected = ids.get(which);
            if (store.state(selected).equals("recording")) Toast.makeText(this, "先暂停或结束，再导出本次记录", Toast.LENGTH_LONG).show();
            else exportSession(selected);
        }).setNegativeButton("关闭", null).show();
    }

    private void exportSession(long selected) {
        exporting = true;
        render();
        Context app = getApplicationContext();
        io.execute(() -> {
            File partial = null;
            try (TrackStore snapshot = new TrackStore(app)) {
                File dir = new File(app.getExternalFilesDir(null), "exports");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("无法创建导出目录");
                String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(new Date());
                File result = new File(dir, "campus-" + selected + "-" + stamp + ".zip");
                partial = new File(dir, result.getName() + ".part");
                try (OutputStream out = new BufferedOutputStream(new FileOutputStream(partial))) { TrackExporter.write(snapshot, selected, out); }
                if (!partial.renameTo(result)) throw new IOException("无法完成导出文件");
                exportFile = result;
                runOnUiThread(() -> {
                    exporting = false;
                    if (isDestroyed()) return;
                    render();
                    new AlertDialog.Builder(this).setTitle("开发数据包已生成")
                        .setMessage("包含原始点、人工标记、诊断和 GPX。\n" + result.getName() + "\n\n连接电脑后可通过 adb 取回，也可以另存到下载目录。")
                        .setNegativeButton("完成", null).setPositiveButton("另存为", (d, w) -> saveAs()).show();
                });
            } catch (Exception e) {
                if (partial != null) partial.delete();
                runOnUiThread(() -> { exporting = false; if (!isDestroyed()) { render(); Toast.makeText(this, "导出失败，原始记录仍保留：" + e.getMessage(), Toast.LENGTH_LONG).show(); } });
            }
        });
    }

    private void saveAs() {
        if (exportFile == null) return;
        Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/zip").putExtra(Intent.EXTRA_TITLE, exportFile.getName());
        startActivityForResult(create, 2);
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 2 || result != RESULT_OK || data == null || data.getData() == null || exportFile == null) return;
        Uri uri = data.getData();
        File source = exportFile;
        ContentResolver resolver = getContentResolver();
        io.execute(() -> {
            try (InputStream in = new FileInputStream(source); OutputStream out = resolver.openOutputStream(uri, "w")) {
                if (out == null) throw new IOException("无法写入所选位置");
                byte[] buffer = new byte[16384];
                int length;
                while ((length = in.read(buffer)) >= 0) out.write(buffer, 0, length);
                runOnUiThread(() -> Toast.makeText(getApplicationContext(), "数据包已另存", Toast.LENGTH_LONG).show());
            } catch (IOException e) { runOnUiThread(() -> Toast.makeText(getApplicationContext(), "另存失败：" + e.getMessage(), Toast.LENGTH_LONG).show()); }
        });
    }

    private void settings() {
        new AlertDialog.Builder(this).setTitle("开始前检查").setMessage("允许精确位置和通知。建议在应用电池设置里选择不受限制；无需允许后台位置。\n\n采集从你点开始时启动，离开页面和锁屏仍由前台服务记录。系统强行停止、重启或权限被收回会中断，回到这里可以看到状态并继续。")
            .setNegativeButton("知道了", null).setNeutralButton("定位设置", (d, w) -> startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)))
            .setPositiveButton("应用设置", (d, w) -> appSettings()).show();
    }
    private void appSettings() { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); }
    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private LinearLayout column() { LinearLayout v = new LinearLayout(this); v.setOrientation(LinearLayout.VERTICAL); return v; }
    private LinearLayout row(LinearLayout parent) {
        LinearLayout v = new LinearLayout(this); v.setOrientation(LinearLayout.HORIZONTAL); parent.addView(v, new LinearLayout.LayoutParams(-1, -2)); return v;
    }
    private LinearLayout card(LinearLayout parent) {
        LinearLayout v = column(); v.setPadding(dp(14), dp(14), dp(14), dp(14));
        GradientDrawable background = new GradientDrawable(); background.setColor(Color.WHITE); background.setCornerRadius(dp(10)); background.setStroke(dp(1), Color.rgb(220, 231, 224)); v.setBackground(background);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.setMargins(0, dp(16), 0, dp(12)); parent.addView(v, p); return v;
    }
    private TextView text(LinearLayout parent, String label, int size, int color) {
        TextView v = new TextView(this); v.setText(label); v.setTextSize(size); v.setTextColor(color); v.setPadding(0, dp(4), 0, dp(4)); parent.addView(v); return v;
    }
    private void title(LinearLayout parent, String label, int size) { text(parent, label, size, INK).setTypeface(null, Typeface.BOLD); }
    private Button button(LinearLayout parent, String label, Runnable action) {
        Button b = new Button(this); b.setText(label); b.setTextSize(14); b.setAllCaps(false); b.setMinHeight(dp(48)); b.setMinWidth(0); b.setOnClickListener(v -> action.run());
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(parent.getOrientation() == LinearLayout.HORIZONTAL ? 0 : -1, -2, parent.getOrientation() == LinearLayout.HORIZONTAL ? 1 : 0);
        p.setMargins(0, dp(2), 0, dp(2)); parent.addView(b, p); return b;
    }
}
