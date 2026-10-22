package cn.jnxundi.campuscollector;

/** Pure policy, using monotonic milliseconds. No coordinate correction or inferred floors. */
final class SamplingPolicy {
    static final long STILL_MS = 180_000;
    static final long NO_FIX_MS = 120_000;
    static final long PROBE_INTERVAL_MS = 180_000;
    static final long PROBE_WINDOW_MS = 30_000;
    static final long DETAIL_MS = 300_000;

    private long lastMovement;
    private long lastGoodFix;
    private long detailUntil;

    SamplingPolicy(long now) { reset(now); }

    void reset(long now) {
        lastMovement = now;
        lastGoodFix = now;
        detailUntil = 0;
    }

    void movement(long now) { lastMovement = now; }
    void detail(long now) { detailUntil = now + DETAIL_MS; movement(now); }
    boolean isDetail(long now) { return now < detailUntil; }

    void fix(long now, float accuracy, float displacement, float speed) {
        if (accuracy <= 35) {
            lastGoodFix = now;
            if (displacement > Math.max(18, accuracy) || speed >= 0.8f) movement(now);
        }
    }

    boolean shouldRest(long now, boolean motionSensorArmed) {
        return motionSensorArmed && !isDetail(now)
            && (now - lastMovement >= STILL_MS || now - lastGoodFix >= NO_FIX_MS);
    }

    static boolean usable(long ageMs, float accuracy, boolean mock) {
        return ageMs >= 0 && ageMs <= 30_000 && accuracy > 0 && accuracy <= 35 && !mock;
    }
}
