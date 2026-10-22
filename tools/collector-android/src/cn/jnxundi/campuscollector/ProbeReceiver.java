package cn.jnxundi.campuscollector;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** A private alarm only wakes an existing recorder; it never starts a new tracking session. */
public final class ProbeReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) { RecorderService.onProbeAlarm(); }
}
