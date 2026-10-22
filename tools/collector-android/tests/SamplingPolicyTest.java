package cn.jnxundi.campuscollector;

public final class SamplingPolicyTest {
    private static int checks;
    private static void check(boolean condition, String message) {
        checks++;
        if (!condition) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        SamplingPolicy policy = new SamplingPolicy(0);
        check(!policy.shouldRest(119999, true), "Initial GPS acquisition must have a full window");
        check(policy.shouldRest(120000, true), "No reliable fix should permit indoor rest");
        check(!policy.shouldRest(900000, false), "Never sleep indefinitely without motion wake-up");
        policy.reset(0);
        policy.fix(100000, 8, 0, 0);
        check(!policy.shouldRest(179999, true), "Do not infer stationary too soon");
        check(policy.shouldRest(180000, true), "Three minutes stationary should rest");
        policy.fix(180000, 9, 28, 0);
        check(!policy.shouldRest(180001, true), "Displacement should resume moving");
        policy.reset(0);
        policy.fix(110000, 200, 500, 4);
        check(policy.shouldRest(120000, true), "Poor fixes must not reset reliable fix or movement clocks");
        policy.detail(120000);
        check(!policy.shouldRest(419999, true), "Temporary detail must suppress automatic rest");
        check(!policy.isDetail(420000), "Detail must expire after five minutes");
        check(SamplingPolicy.usable(30000, 35, false), "Quality boundary should be inclusive");
        check(!SamplingPolicy.usable(30001, 5, false), "Stale fixes cannot be usable");
        check(!SamplingPolicy.usable(-1, 5, false), "Future monotonic fixes cannot be usable");
        check(!SamplingPolicy.usable(0, 0, false), "Zero accuracy is not trustworthy");
        check(!SamplingPolicy.usable(0, 36, false), "Poor precision cannot be usable");
        check(!SamplingPolicy.usable(0, 5, true), "Mock positions cannot train map data");
        System.out.println("SamplingPolicy: " + checks + " checks passed");
    }
}
