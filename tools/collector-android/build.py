"""Build the standalone Android survey utility using only a local JDK and Android SDK."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile


def run(*args: str | Path) -> None:
    subprocess.run([str(arg) for arg in args], check=True)


def main() -> None:
    source = Path(__file__).resolve().parent
    repo = source.parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, default=os.environ.get("ANDROID_HOME", "D:/Applications/AndroidSDK"))
    parser.add_argument("--java-home", type=Path, default=os.environ.get("JAVA_HOME"))
    options = parser.parse_args()
    sdk = options.sdk.resolve()
    suffix = ".exe" if os.name == "nt" else ""
    java_bin = options.java_home.resolve() / "bin" if options.java_home else Path(shutil.which("javac") or "missing-javac").resolve().parent
    java, javac, keytool = (java_bin / (name + suffix) for name in ("java", "javac", "keytool"))
    tools = sdk / "build-tools" / "36.0.0"
    android = sdk / "platforms" / "android-36" / "android.jar"
    for needed in (java, javac, keytool, android, tools / ("aapt2" + suffix), tools / "lib" / "d8.jar", tools / "lib" / "apksigner.jar"):
        if not needed.is_file():
            raise SystemExit(f"Missing build tool: {needed}; pass --sdk / --java-home to select installed tools")
    output = repo / ".campus-map-qa" / "collector-android"
    output.mkdir(parents=True, exist_ok=True)
    # All transient files and the development key stay inside this ignored workspace directory.
    with tempfile.TemporaryDirectory(prefix="build-", dir=output) as temp:
        work = Path(temp)
        classes, dex, tests = (work / name for name in ("classes", "dex", "tests"))
        for path in (classes, dex, tests):
            path.mkdir()
        package = source / "src" / "cn" / "jnxundi" / "campuscollector"
        run(javac, "-encoding", "UTF-8", "-d", tests, package / "SamplingPolicy.java", source / "tests" / "SamplingPolicyTest.java")
        run(java, "-cp", tests, "cn.jnxundi.campuscollector.SamplingPolicyTest")
        boot = os.pathsep.join(str(path) for path in (android, tools / "core-lambda-stubs.jar"))
        run(javac, "-encoding", "UTF-8", "-source", "8", "-target", "8", "-Xlint:-options", "-bootclasspath", boot, "-d", classes, *sorted(package.glob("*.java")))
        archive = work / "classes.jar"
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as jar:
            for path in classes.rglob("*.class"):
                jar.write(path, path.relative_to(classes).as_posix())
        run(java, "-cp", tools / "lib" / "d8.jar", "com.android.tools.r8.D8", "--lib", android, "--min-api", "33", "--output", dex, archive)
        resources = work / "resources.zip"
        unsigned = work / "unsigned.apk"
        run(tools / ("aapt2" + suffix), "compile", "--dir", source / "res", "-o", resources)
        run(tools / ("aapt2" + suffix), "link", "-I", android, "--manifest", source / "AndroidManifest.xml", "--min-sdk-version", "33", "--target-sdk-version", "36", "-o", unsigned, resources)
        with zipfile.ZipFile(unsigned, "a", zipfile.ZIP_DEFLATED) as apk:
            for path in dex.glob("*.dex"):
                apk.write(path, path.name)
        aligned = work / "aligned.apk"
        run(tools / ("zipalign" + suffix), "-f", "4", unsigned, aligned)
        key = output / "development.keystore"
        if not key.exists():
            run(keytool, "-genkeypair", "-keystore", key, "-storepass", "android", "-keypass", "android", "-alias", "campus-survey", "-keyalg", "RSA", "-keysize", "2048", "-validity", "3650", "-dname", "CN=Campus Survey Development", "-noprompt")
        result = output / "campus-collector-debug.apk"
        signer = tools / "lib" / "apksigner.jar"
        run(java, "-jar", signer, "sign", "--ks", key, "--ks-pass", "pass:android", "--key-pass", "pass:android", "--out", result, aligned)
        run(java, "-jar", signer, "verify", "--verbose", result)
        print(f"APK: {result}")


if __name__ == "__main__":
    main()
