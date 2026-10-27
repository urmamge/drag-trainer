**Gap check now lets you set how long a pause counts as a gap.** A quick reset between drags no longer counts as a pause. This is the version without hand tracking; [v1.1.2](https://github.com/urmamge/drag-trainer/releases/tag/v1.1.2) has the same update plus camera features.

**Download `Drag-Trainer.exe` below and run it.** There's no installer. Windows may show a "Windows protected your PC" warning the first time because the app isn't code-signed; click **More info → Run anyway**. The [README](https://github.com/urmamge/drag-trainer#is-it-safe) explains why and how to check the file yourself.

### New in v1.0.2
- **Max gap setting** (Settings → Max gap: 50, 75, 100 or 150ms). Gap check used to count every pause over 50ms as a gap, so a normal reset between drags broke your clean run every time. The default is now 100ms, and clean run, steadiness, the Coach and the chart line all follow the setting. Best clean runs are saved separately for each setting, and your old best stays under 50ms.
- **Clearer reset tip.** When your gaps come from resets, the Coach now says how to fix them: lift only just off the button, go straight back to the top, and start the next drag as soon as you land.
- With **Bridge coach** on, the bridging verdicts use your Max gap too, and the guide explains why 100ms is usually fine for bridging.

### Checking the download
This exe was built by GitHub Actions straight from the tagged source code. `SHA256SUMS.txt` has its checksum, and the build is attested by GitHub:

```
gh attestation verify Drag-Trainer.exe --repo urmamge/drag-trainer
```
