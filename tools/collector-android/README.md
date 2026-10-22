# Android 实地采集器

独立的校园地图开发工具，包名 `cn.jnxundi.campuscollector`，手机显示「校园采集」。面向 Android 13 及以上，无第三方运行时依赖，不申请网络、后台位置或广泛存储权限；用户从可见页面开始前台定位服务。不是校园门户正式功能。

## 明天怎么用

1. 出门前打开「校园采集」，点「开始采集」。精确位置和通知权限已经在本次设备测试中授予。
2. 正常锁屏使用。入口、停车、取车、教室或楼梯处可以记录简短备注；在室内写清楼栋、楼层、东西方向，比室内 GPS 更有用。
3. 长时间上课可选「上课 / 停留」，显著运动会恢复采集，也可以手动点「继续赶路」。窄路、入口附近可选「细采集 5 分钟」。
4. 回来点「结束并保存」，在「导出数据 / 历史记录」选择当天记录，生成 ZIP。可另存到下载目录，或连接电脑取回。

建议在应用的电池设置里选择不受限制，保留常驻通知。不要强行停止、清理数据或重启手机。系统终止、权限撤回等仍可能中断，应用会显示服务中断，可以继续；不自动开机追踪，不填补缺失轨迹。

```powershell
adb shell ls /sdcard/Android/data/cn.jnxundi.campuscollector/files/exports
adb pull /sdcard/Android/data/cn.jnxundi.campuscollector/files/exports .campus-map-qa/collector-exports
```

这些数据包含精确行程，默认只留在手机和本地忽略目录；由用户自行选择分享。

## 数据与省电边界

- 均衡模式请求 GPS 每 10 秒且移动 5 米；细采集每 3 秒 / 2 米，五分钟后恢复。请求间隔不是系统交付保证。
- 可靠定位下静止三分钟，或两分钟无可靠定位，且运动唤醒已注册时，关闭连续 GPS。保留网络/被动定位和显著运动传感器；约三分钟请求一次最长三十秒 GPS 窗口。系统深度休眠可延迟探测，运动传感器没有响应时可能漏掉刚出发的一段。
- GPS 窗口的截止由 Android LocationRequest 执行，避免依赖应用休眠期间的计时器关 GPS。不持有持续唤醒锁，不采集高频加速度流。
- 没有可用运动唤醒传感器时，不自动进入停留休眠；可手动暂停。省电能力取决于硬件和系统调度，尚未进行全天续航实测。
- 原始点全部保留精度、来源、UTC、单调时间、速度、海拔、电量和充电状态。`usable=1` 仅表示非模拟、接收时不超过 30 秒、水平精度不大于 35 米，不能当作精确路缘或门位。
- 入口/停车标记关联最近位置及其时间差；可能关联很旧的位置，也可能完全没有位置。必须结合备注核对，不能自动写入地图为已核实入口。
- ZIP 包含 `metadata.json`、`points.csv`、`events.jsonl`、`track.gpx`、格式说明。GPX 只含可用点，超过 90 秒、暂停或服务重启处分段。CSV 和事件是分析依据。
- SQLite WAL 保存记录；结束、关闭页面和再次开始不会删除历史记录。没有提供删除按钮。调试版本允许通过受信任电脑的 `adb run-as` 读取数据，签名密钥和 APK 仅在本地忽略目录。
- 电量百分比记录的是整机电量，不能归因到这个应用。接电测试不能评估全天耗电。室内楼层、房间结构不能从 GPS 推导；手机重启会使单调时间归零，建议结束本次采集后重启。

## 源码与构建

`src/cn/jnxundi/campuscollector/` 按界面、定位服务、省电策略、SQLite 存储、ZIP 导出拆分。它们是地图调查工具，不放进 React 路由、公共 UI 或门户 Android 壳。`SamplingPolicyTest` 检查休眠时机、运动唤醒降级、精度/时效/模拟点边界。

构建只使用本机 JDK、Android SDK 36 / build-tools 36.0.0，不下载 Gradle 或依赖：

```powershell
python tools/campus-map/collector-android/build.py --sdk D:/Applications/AndroidSDK --java-home C:/Users/mc158/.gradle/jdks/eclipse_adoptium-21-amd64-windows.2
adb install -r .campus-map-qa/collector-android/campus-collector-debug.apk
adb shell am start -n cn.jnxundi.campuscollector/.MainActivity
```

开发签名保存在 `.campus-map-qa/collector-android/development.keystore`，重复构建可覆盖安装并保留数据；不要删除密钥后试图覆盖安装，否则签名不匹配。APK 不提交。

`device_check.py` 是仅针对采集器控件的 adb 检查辅助器，支持 `status`、`tap start/pause/resume/stop`、`screenshot` 和 `assert-stopped`，不会设置模拟位置或修改系统定位提供器。

## 2026-10-21 验证记录

- 已在连接的 Sony XQ-ES72 / Android 16 上安装并启动。
- 前台 location 类型服务启动正常，通知权限和精确定位权限已授予；入口标记、停留按钮和结束确认可操作。
- 熄屏时检查到前台服务仍在运行，随后通过界面结束，确认没有采集服务残留，已恢复熄屏。
- 实际收到的室内定位包含旧缓存，保留原始数据并标为不可用；没有模拟位置或将室内漂移当作真实路线。
- 省电策略 15 项聚焦检查通过，APK 签名校验通过。
- 按用户要求停止进一步室内测试。尚未验证全天后台连续性、户外路线精度、运动自动恢复的实走表现、导出内容端到端和实际耗电；明日实地采集后再评估。

平台依据：[Android 定位与电池](https://developer.android.com/develop/sensors-and-location/location/battery)、[前台服务 location 类型](https://developer.android.com/develop/background-work/services/fgs/service-types#location)、[LocationManager](https://developer.android.com/reference/android/location/LocationManager)。
