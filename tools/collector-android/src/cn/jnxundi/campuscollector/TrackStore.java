package cn.jnxundi.campuscollector;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.location.Location;
import android.os.Build;
import android.os.SystemClock;
import org.json.JSONException;
import org.json.JSONObject;

final class TrackStore extends SQLiteOpenHelper {
    TrackStore(Context context) {
        super(context, "campus-tracks.db", null, 1);
        setWriteAheadLoggingEnabled(true);
    }

    @Override public void onConfigure(SQLiteDatabase db) {
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE sessions(id INTEGER PRIMARY KEY AUTOINCREMENT,started_ms INTEGER NOT NULL,ended_ms INTEGER,state TEXT NOT NULL,metadata TEXT NOT NULL)");
        db.execSQL("CREATE TABLE points(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id INTEGER NOT NULL REFERENCES sessions(id),received_ms INTEGER NOT NULL,received_elapsed_ms INTEGER NOT NULL,fix_ms INTEGER NOT NULL,fix_elapsed_ns INTEGER NOT NULL,latitude REAL NOT NULL,longitude REAL NOT NULL,accuracy_m REAL,altitude_m REAL,vertical_accuracy_m REAL,speed_mps REAL,bearing_deg REAL,provider TEXT,mock INTEGER NOT NULL,battery_pct INTEGER,charging INTEGER,phase TEXT NOT NULL,usable INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX points_session ON points(session_id,id)");
        db.execSQL("CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id INTEGER NOT NULL REFERENCES sessions(id),time_ms INTEGER NOT NULL,elapsed_ms INTEGER NOT NULL,type TEXT NOT NULL,note TEXT NOT NULL,point_id INTEGER REFERENCES points(id),point_age_ms INTEGER,battery_pct INTEGER)");
        db.execSQL("CREATE INDEX events_session ON events(session_id,id)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("Unsupported schema upgrade; preserve the original database");
    }

    long createSession(int battery) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            JSONObject metadata = new JSONObject();
            metadata.put("schema_version", 1);
            metadata.put("app_version", "0.1.0");
            metadata.put("device", Build.MANUFACTURER + " " + Build.MODEL);
            metadata.put("android_sdk", Build.VERSION.SDK_INT);
            metadata.put("coordinate_system", "WGS84 (raw Android providers; no GCJ02 conversion)");
            metadata.put("battery_start_pct", battery);
            metadata.put("balanced_interval_ms", 10000);
            metadata.put("balanced_min_distance_m", 5);
            metadata.put("stationary_probe_interval_ms", SamplingPolicy.PROBE_INTERVAL_MS);
            metadata.put("stationary_probe_window_ms", SamplingPolicy.PROBE_WINDOW_MS);
            ContentValues v = new ContentValues();
            v.put("started_ms", System.currentTimeMillis());
            v.put("state", "recording");
            v.put("metadata", metadata.toString());
            long id = db.insertOrThrow("sessions", null, v);
            event(id, "start", "用户开始采集", battery);
            db.setTransactionSuccessful();
            return id;
        } catch (JSONException e) { throw new IllegalStateException(e); }
        finally { db.endTransaction(); }
    }

    long latestSession() {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id FROM sessions ORDER BY id DESC LIMIT 1", null)) {
            return c.moveToFirst() ? c.getLong(0) : 0;
        }
    }

    long unfinishedSession() {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id FROM sessions WHERE state IN ('recording','paused') ORDER BY id DESC LIMIT 1", null)) {
            return c.moveToFirst() ? c.getLong(0) : 0;
        }
    }

    String state(long session) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT state FROM sessions WHERE id=?", args(session))) {
            return c.moveToFirst() ? c.getString(0) : "idle";
        }
    }

    void state(long session, String state) {
        ContentValues v = new ContentValues();
        v.put("state", state);
        if (state.equals("stopped")) v.put("ended_ms", System.currentTimeMillis());
        getWritableDatabase().update("sessions", v, "id=?", args(session));
    }

    void point(long session, Location l, int battery, boolean charging, String phase) {
        long elapsed = SystemClock.elapsedRealtime();
        long age = elapsed - l.getElapsedRealtimeNanos() / 1_000_000;
        ContentValues v = new ContentValues();
        v.put("session_id", session);
        v.put("received_ms", System.currentTimeMillis());
        v.put("received_elapsed_ms", elapsed);
        v.put("fix_ms", l.getTime());
        v.put("fix_elapsed_ns", l.getElapsedRealtimeNanos());
        v.put("latitude", l.getLatitude());
        v.put("longitude", l.getLongitude());
        if (l.hasAccuracy()) v.put("accuracy_m", l.getAccuracy());
        if (l.hasAltitude()) v.put("altitude_m", l.getAltitude());
        if (l.hasVerticalAccuracy()) v.put("vertical_accuracy_m", l.getVerticalAccuracyMeters());
        if (l.hasSpeed()) v.put("speed_mps", l.getSpeed());
        if (l.hasBearing()) v.put("bearing_deg", l.getBearing());
        v.put("provider", l.getProvider());
        v.put("mock", l.isFromMockProvider() ? 1 : 0);
        v.put("battery_pct", battery);
        v.put("charging", charging ? 1 : 0);
        v.put("phase", phase);
        v.put("usable", l.hasAccuracy() && SamplingPolicy.usable(age, l.getAccuracy(), l.isFromMockProvider()) ? 1 : 0);
        getWritableDatabase().insertOrThrow("points", null, v);
    }

    void event(long session, String type, String note, int battery) {
        ContentValues v = new ContentValues();
        v.put("session_id", session);
        v.put("time_ms", System.currentTimeMillis());
        v.put("elapsed_ms", SystemClock.elapsedRealtime());
        v.put("type", type);
        v.put("note", note);
        v.put("battery_pct", battery);
        // Link only within this session. Old / absent positions remain explicitly distinguishable.
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id,fix_elapsed_ns FROM points WHERE session_id=? ORDER BY id DESC LIMIT 1", args(session))) {
            if (c.moveToFirst()) {
                long age = SystemClock.elapsedRealtime() - c.getLong(1) / 1_000_000;
                if (age >= 0) {
                    v.put("point_id", c.getLong(0));
                    v.put("point_age_ms", age);
                }
            }
        }
        getWritableDatabase().insertOrThrow("events", null, v);
    }

    JSONObject summary(long session) throws JSONException {
        JSONObject result = new JSONObject();
        result.put("session_id", session);
        result.put("state", state(session));
        result.put("points", scalar("SELECT count(*) FROM points WHERE session_id=?", session));
        result.put("usable_points", scalar("SELECT count(*) FROM points WHERE session_id=? AND usable=1", session));
        result.put("events", scalar("SELECT count(*) FROM events WHERE session_id=?", session));
        try (Cursor c = getReadableDatabase().rawQuery("SELECT accuracy_m,provider,fix_elapsed_ns FROM points WHERE session_id=? ORDER BY id DESC LIMIT 1", args(session))) {
            if (c.moveToFirst()) {
                result.put("accuracy_m", c.isNull(0) ? JSONObject.NULL : c.getDouble(0));
                result.put("provider", c.getString(1));
                long age = SystemClock.elapsedRealtime() - c.getLong(2) / 1_000_000;
                result.put("age_s", age >= 0 ? age / 1000 : -1);
            }
        }
        return result;
    }

    private long scalar(String sql, long session) {
        try (Cursor c = getReadableDatabase().rawQuery(sql, args(session))) { c.moveToFirst(); return c.getLong(0); }
    }

    static String[] args(long session) { return new String[]{Long.toString(session)}; }
}
