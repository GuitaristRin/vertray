package cn.jnxundi.campuscollector;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

final class TrackExporter {
    private static final String USAGE = "校园采集 schema 1\n"
        + "points.csv 保留全部原始位置，WGS84，无吸附、平滑、GCJ02转换。usable=1仅代表非模拟、接收时不超过30秒、水平精度≤35米，不等同测绘真值。\n"
        + "events.jsonl 包含入口/停车/教室等人工标记、暂停/恢复、省电和诊断。point_id可为空，point_age_ms表示标记距离定位的时间差；旧坐标不可当作入口坐标。\n"
        + "track.gpx仅输出usable点，超过90秒或暂停/服务重启处断开；GPX简化视图不能替代CSV。室内无点不填补，楼层/门位必须实地确认。\n"
        + "metadata.json包含采集参数、机型、开始/结束时间与电量。时间为UTC epoch，elapsed为开机后单调时间；重启手机可能使elapsed归零。\n"
        + "省电探测依赖运动传感器及系统调度，3分钟为请求周期，深度休眠可延迟。电量百分比包含整机耗电，充电时不能估算采集器耗电。\n";

    static void write(TrackStore store, long session, OutputStream output) throws IOException, JSONException {
        SQLiteDatabase db = store.getReadableDatabase();
        // A separate SQLite connection/helper gives a consistent snapshot without copying live WAL files.
        db.beginTransactionNonExclusive();
        try (ZipOutputStream zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
            JSONObject meta = store.summary(session);
            try (Cursor c = db.rawQuery("SELECT started_ms,ended_ms,metadata FROM sessions WHERE id=?", TrackStore.args(session))) {
                if (!c.moveToFirst()) throw new IOException("找不到采集记录");
                meta.put("started_ms", c.getLong(0));
                meta.put("ended_ms", c.isNull(1) ? JSONObject.NULL : c.getLong(1));
                meta.put("config", new JSONObject(c.getString(2)));
            }
            meta.put("exported_ms", System.currentTimeMillis());
            entry(zip, "metadata.json", meta.toString(2));
            entry(zip, "README.txt", USAGE);
            zip.putNextEntry(new ZipEntry("points.csv"));
            try (Cursor c = db.rawQuery("SELECT * FROM points WHERE session_id=? ORDER BY id", TrackStore.args(session))) {
                String[] columns = c.getColumnNames();
                line(zip, String.join(",", columns));
                while (c.moveToNext()) {
                    StringBuilder row = new StringBuilder();
                    for (int i = 0; i < columns.length; i++) {
                        if (i > 0) row.append(',');
                        if (!c.isNull(i)) row.append('"').append(c.getString(i).replace("\"", "\"\"")).append('"');
                    }
                    line(zip, row.toString());
                }
            }
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("events.jsonl"));
            try (Cursor c = db.rawQuery("SELECT * FROM events WHERE session_id=? ORDER BY id", TrackStore.args(session))) {
                while (c.moveToNext()) {
                    JSONObject event = new JSONObject();
                    for (int i = 0; i < c.getColumnCount(); i++) {
                        Object value = c.isNull(i) ? JSONObject.NULL : c.getType(i) == Cursor.FIELD_TYPE_INTEGER ? c.getLong(i) : c.getString(i);
                        event.put(c.getColumnName(i), value);
                    }
                    line(zip, event.toString());
                }
            }
            zip.closeEntry();
            writeGpx(db, session, zip);
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }

    private static void writeGpx(SQLiteDatabase db, long session, ZipOutputStream zip) throws IOException {
        zip.putNextEntry(new ZipEntry("track.gpx"));
        line(zip, "<?xml version=\"1.0\" encoding=\"UTF-8\"?><gpx version=\"1.1\" creator=\"CampusCollector\" xmlns=\"http://www.topografix.com/GPX/1/1\"><trk><name>校园采集 " + session + "</name>");
        SimpleDateFormat utc = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        utc.setTimeZone(TimeZone.getTimeZone("UTC"));
        boolean segment = false;
        long previousElapsed = -1, previousReceived = -1;
        try (Cursor c = db.rawQuery("SELECT latitude,longitude,fix_ms,fix_elapsed_ns,received_ms FROM points WHERE session_id=? AND usable=1 ORDER BY id", TrackStore.args(session))) {
            while (c.moveToNext()) {
                long elapsed = c.getLong(3) / 1_000_000, received = c.getLong(4);
                boolean boundary = previousElapsed < 0 || elapsed - previousElapsed > 90_000 || elapsed < previousElapsed;
                if (!boundary) {
                    try (Cursor events = db.rawQuery("SELECT 1 FROM events WHERE session_id=? AND time_ms>? AND time_ms<=? AND type IN ('pause','resume','service_restart','stop') LIMIT 1",
                        new String[]{Long.toString(session), Long.toString(previousReceived), Long.toString(received)})) { boundary = events.moveToFirst(); }
                }
                if (boundary) {
                    if (segment) line(zip, "</trkseg>");
                    line(zip, "<trkseg>");
                    segment = true;
                }
                line(zip, "<trkpt lat=\"" + c.getString(0) + "\" lon=\"" + c.getString(1) + "\"><time>" + utc.format(new Date(c.getLong(2))) + "</time></trkpt>");
                previousElapsed = elapsed;
                previousReceived = received;
            }
        }
        if (segment) line(zip, "</trkseg>");
        line(zip, "</trk></gpx>");
        zip.closeEntry();
    }

    private static void entry(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name)); line(zip, content); zip.closeEntry();
    }
    private static void line(ZipOutputStream zip, String text) throws IOException { zip.write((text + "\n").getBytes(StandardCharsets.UTF_8)); }
}
