**Gap check: see the pause before every click.** Steady drag clicking means no dead time between clicks, and this shows you exactly where it goes. This is the version without hand tracking; [v1.1.1](https://github.com/urmamge/drag-trainer/releases/tag/v1.1.1) has the same update plus camera features.

**Download `Drag-Trainer.exe` below and run it.** There's no installer. Windows may show a "Windows protected your PC" warning the first time because the app isn't code-signed; click **More info → Run anyway**. The [README](https://github.com/urmamge/drag-trainer#is-it-safe) explains why and how to check the file yourself.

### New in v1.0.1
- **Gap check mode.** A bar for every click showing the gap before it, with a 50ms line. It shows your longest gap, how steady your clicking is, and your longest clean run (no gap over 50ms), with an all-time best. The Coach says whether each gap was a reset between drags or a drag fading out, and the session report tells you which one is holding you back.
- **Timed runs** now show your longest gap too.
- **Settings menu** with an optional **Bridge coach**: when it's on, Gap check also tells you whether your clicking is steady enough to god bridge in Minecraft. It's off by default.

### Checking the download
This exe was built by GitHub Actions straight from the tagged source code. `SHA256SUMS.txt` has its checksum, and the build is attested by GitHub:

```
gh attestation verify Drag-Trainer.exe --repo urmamge/drag-trainer
```
