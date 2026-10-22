package cn.jnxundi.campuscollector;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.hardware.*;
import android.location.*;
import android.os.*;

public final class RecorderService extends Service implements LocationListener {
    static final String START = "start", PAUSE = "pause", STOP = "stop", MARK = "mark", DETAIL = "detail", REST = "rest", WALK = "walk";
    private static final String CHANNEL = "campus-recording";
    private static RecorderService instance;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TrackStore store;
    private LocationManager locations;
    private SensorManager sensors;
    private Sensor significantMotion;
    private SamplingPolicy policy;
    private Location anchor;
    private long session, lastFixReceived, gpsStarted, lastFixNanos;
    private String phase = "等待开始";
    private boolean recording, resting, gpsOn, motionArmed, probing;
    private int battery = -1;
    private boolean charging;

    static boolean isRunning() { return instance != null; }
    static String phase() { return instance == null ? "服务未运行" : instance.phase; }
    static void onProbeAlarm() { if (instance != null) instance.probe(); }

    private final TriggerEventListener motion = new TriggerEventListener() {
        @Override public void onTrigger(TriggerEvent event) {
            handler.post(() -> {
                motionArmed = false;
                if (!recording) return;
                policy.movement(SystemClock.elapsedRealtime());
                log("motion", "显著运动传感器唤醒");
                armMotion();
                if (resting) resumeMoving();
            });
        }
    };

    private final Runnable endProbe = () -> {
        probing = false;
        if (recording && resting) {
            stopGps();
            phase = "停留省电 · 等待走动";
            notifyStatus();
        }
    };

    private final Runnable heartbeat = new Runnable() {
        @Override public void run() {
            if (recording) {
                try {
                    refreshBattery();
                    long now = SystemClock.elapsedRealtime();
                    if (policy.shouldRest(now, motionArmed) && !resting) enterRest("自动停留或长时间无可靠定位");
                    if (now - lastFixReceived > 90_000) log("fix_gap", "无新定位毫秒=" + (now - lastFixReceived));
                    if (gpsOn && now - gpsStarted > 90_000 && now - lastFixReceived > 90_000) phase = "定位较弱 · 建议到室外确认";
                    log("heartbeat", "phase=" + phase + ";charging=" + charging + ";power_save=" + getSystemService(PowerManager.class).isPowerSaveMode());
                    notifyStatus();
                } catch (RuntimeException e) { fail(e); }
            }
            if (instance == RecorderService.this) handler.postDelayed(this, 60_000);
        }
    };

    private final BroadcastReceiver providers = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent intent) {
            if (!recording) return;
            try {
                log("providers", locations.getProviders(true).toString());
                if (!locations.isLocationEnabled()) {
                    stopGps();
                    phase = "系统定位已关闭 · 请打开";
                } else if (!resting) startGps();
                notifyStatus();
            } catch (RuntimeException e) { fail(e); }
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        store = new TrackStore(this);
        locations = getSystemService(LocationManager.class);
        sensors = getSystemService(SensorManager.class);
        significantMotion = sensors.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION);
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL, "校园轨迹采集", NotificationManager.IMPORTANCE_LOW));
        policy = new SamplingPolicy(SystemClock.elapsedRealtime());
        registerReceiver(providers, new IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION), Context.RECEIVER_NOT_EXPORTED);
        handler.postDelayed(heartbeat, 60_000);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            refreshBattery();
            String action = intent == null ? "restart" : intent.getAction();
            if (session == 0) session = store.unfinishedSession();
            if (STOP.equals(action)) { finish(); return START_NOT_STICKY; }
            if (START.equals(action) || "restart".equals(action)) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    phase = "需要精确定位权限";
                    if (session != 0) { log("permission_missing", phase); store.state(session, "paused"); }
                    stopSelf();
                    return START_NOT_STICKY;
                }
                if (session == 0 && "restart".equals(action)) { stopSelf(); return START_NOT_STICKY; }
                // The visible Activity starts this foreground service; sticky restarts retain that session.
                phase = "正在启动";
                startForeground(1, notification());
                if (session == 0) session = store.createSession(battery);
                boolean pausedRestart = "restart".equals(action) && store.state(session).equals("paused");
                if (pausedRestart) { phase = "已暂停"; notifyStatus(); return START_STICKY; }
                if (!recording) {
                    log("restart".equals(action) ? "service_restart" : "resume", "服务启动；不填补定位断点");
                    store.state(session, "recording");
                    recording = true;
                    lastFixReceived = SystemClock.elapsedRealtime();
                    policy.reset(lastFixReceived);
                    armMotion();
                    registerLowPowerProviders();
                    resumeMoving();
                }
            } else if (session != 0 && PAUSE.equals(action)) {
                log("pause", "用户暂停");
                recording = false;
                cleanupSampling();
                store.state(session, "paused");
                phase = "已暂停 · 不采集位置";
            } else if (session != 0 && MARK.equals(action)) {
                log("marker", intent.getStringExtra("note") == null ? "未命名标记" : intent.getStringExtra("note"));
            } else if (recording && DETAIL.equals(action)) {
                policy.detail(SystemClock.elapsedRealtime());
                log("detail", "五分钟细采集：3秒 / 2米");
                resumeMoving();
            } else if (recording && REST.equals(action)) {
                log("marker", "上课 / 室内停留");
                if (motionArmed) enterRest("用户选择停留");
                else { phase = "无运动唤醒传感器 · 请使用暂停"; log("sensor_unavailable", phase); }
            } else if (recording && WALK.equals(action)) {
                policy.reset(SystemClock.elapsedRealtime());
                log("marker", "继续赶路");
                resumeMoving();
            }
            if (session != 0) notifyStatus();
            else stopSelf();
            return START_STICKY;
        } catch (RuntimeException e) { fail(e); return START_NOT_STICKY; }
    }

    private void armMotion() {
        if (significantMotion != null && !motionArmed) motionArmed = sensors.requestTriggerSensor(motion, significantMotion);
    }

    private void registerLowPowerProviders() {
        for (String provider : new String[]{LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER}) {
            if (locations.hasProvider(provider)) locations.requestLocationUpdates(provider, 60_000, 15, this, Looper.getMainLooper());
        }
        log("capabilities", "运动唤醒=" + motionArmed + ";providers=" + locations.getAllProviders());
    }

    private void startGps() {
        stopGps();
        if (!locations.hasProvider(LocationManager.GPS_PROVIDER)) {
            phase = "设备无 GPS · 仅记录可用定位";
            log("gps_unavailable", phase);
            return;
        }
        boolean detail = policy.isDetail(SystemClock.elapsedRealtime());
        LocationRequest.Builder request = new LocationRequest.Builder(detail ? 3000 : 10000)
            .setQuality(LocationRequest.QUALITY_HIGH_ACCURACY).setMinUpdateDistanceMeters(detail ? 2 : 5);
        // The OS enforces the probe deadline even if the app's Handler is suspended in sleep.
        if (resting) request.setDurationMillis(SamplingPolicy.PROBE_WINDOW_MS);
        locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, request.build(), getMainExecutor(), gpsListener);
        gpsOn = true;
        gpsStarted = SystemClock.elapsedRealtime();
        phase = locations.isLocationEnabled() ? (detail ? "五分钟细采集 · 3秒 / 2米" : "均衡采集 · 10秒 / 5米") : "系统定位已关闭 · 请打开";
        // Expire the detail request itself, not just its label.
        handler.removeCallbacks(expireDetail);
        if (detail) handler.postDelayed(expireDetail, SamplingPolicy.DETAIL_MS);
    }

    private final Runnable expireDetail = () -> {
        if (recording && !resting) { policy.reset(SystemClock.elapsedRealtime()); startGps(); notifyStatus(); }
    };

    private void stopGps() {
        // Each provider has its own listener, so removing GPS never removes the passive wake-up path.
        locations.removeUpdates(gpsListener);
        gpsOn = false;
    }

    private final LocationListener gpsListener = new LocationListener() {
        @Override public void onLocationChanged(Location location) { RecorderService.this.onLocationChanged(location); }
    };

    private void resumeMoving() {
        resting = false;
        probing = false;
        cancelProbe();
        handler.removeCallbacks(endProbe);
        anchor = null;
        startGps();
        notifyStatus();
    }

    private void enterRest(String reason) {
        resting = true;
        probing = false;
        stopGps();
        phase = "停留省电 · 走动自动恢复";
        log("rest", reason);
        scheduleProbe();
        notifyStatus();
    }

    private void scheduleProbe() {
        getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + SamplingPolicy.PROBE_INTERVAL_MS, probeIntent());
    }

    private PendingIntent probeIntent() {
        return PendingIntent.getBroadcast(this, 7, new Intent(this, ProbeReceiver.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private void cancelProbe() { getSystemService(AlarmManager.class).cancel(probeIntent()); }

    private void probe() {
        if (!recording || !resting) return;
        try {
            probing = true;
            startGps();
            phase = "停留省电 · 短时复核位置";
            log("probe", "30秒定位窗口；系统可能推迟唤醒");
            handler.removeCallbacks(endProbe);
            handler.postDelayed(endProbe, SamplingPolicy.PROBE_WINDOW_MS);
            scheduleProbe();
            notifyStatus();
        } catch (RuntimeException e) { fail(e); }
    }

    @Override public void onLocationChanged(Location location) {
        if (!recording) return;
        try {
            long now = SystemClock.elapsedRealtime();
            long nanos = location.getElapsedRealtimeNanos();
            // Providers may deliver the same fix through the passive provider too.
            if (nanos == lastFixNanos) return;
            lastFixNanos = nanos;
            long age = now - nanos / 1_000_000;
            refreshBattery();
            store.point(session, location, battery, charging, resting ? "rest" : policy.isDetail(now) ? "detail" : "moving");
            lastFixReceived = now;
            if (location.hasAccuracy() && SamplingPolicy.usable(age, location.getAccuracy(), location.isFromMockProvider())) {
                float distance = anchor == null ? 0 : location.distanceTo(anchor);
                policy.fix(now, location.getAccuracy(), distance, location.hasSpeed() ? location.getSpeed() : 0);
                if (anchor == null || distance > Math.max(18, location.getAccuracy())) anchor = new Location(location);
                if (resting && distance > Math.max(25, location.getAccuracy())) {
                    log("movement_fix", "位置移动恢复");
                    resumeMoving();
                }
            }
            if (gpsOn && !resting) phase = policy.isDetail(now) ? "五分钟细采集 · 3秒 / 2米" : "均衡采集 · 10秒 / 5米";
            notifyStatus();
        } catch (RuntimeException e) { fail(e); }
    }

    private void refreshBattery() {
        Intent i = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (i == null) return;
        int level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        battery = level >= 0 && scale > 0 ? level * 100 / scale : -1;
        charging = i.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0;
    }

    private void log(String type, String note) { if (session != 0) store.event(session, type, note, battery); }

    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("校园采集 · " + phase)
            .setContentText("仅保存在本机 · 点击查看状态和标记").setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true);
        if (recording) b.addAction(new Notification.Action.Builder(null, "暂停", command(PAUSE, 1)).build());
        b.addAction(new Notification.Action.Builder(null, "结束并保存", command(STOP, 2)).build());
        return b.build();
    }

    private PendingIntent command(String action, int code) {
        return PendingIntent.getService(this, code, new Intent(this, RecorderService.class).setAction(action), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void notifyStatus() { getSystemService(NotificationManager.class).notify(1, notification()); }

    private void cleanupSampling() {
        stopGps();
        locations.removeUpdates(this);
        sensors.cancelTriggerSensor(motion, significantMotion);
        motionArmed = false;
        cancelProbe();
        handler.removeCallbacks(endProbe);
        handler.removeCallbacks(expireDetail);
    }

    private void finish() {
        if (session != 0) { log("stop", "用户结束并保存"); store.state(session, "stopped"); }
        recording = false;
        cleanupSampling();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void fail(RuntimeException e) {
        android.util.Log.e("CampusCollector", "Recorder stopped safely", e);
        getSharedPreferences("collector", MODE_PRIVATE).edit().putString("error", e.getClass().getSimpleName() + ": " + e.getMessage()).apply();
        recording = false;
        cleanupSampling();
        phase = "采集中断 · 打开应用检查";
        notifyStatus();
        stopForeground(STOP_FOREGROUND_DETACH);
        stopSelf();
    }

    @Override public void onDestroy() {
        recording = false;
        cleanupSampling();
        handler.removeCallbacksAndMessages(null);
        unregisterReceiver(providers);
        store.close();
        instance = null;
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
