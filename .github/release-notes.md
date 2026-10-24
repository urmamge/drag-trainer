First public release of Drag Trainer, a Windows app for learning to drag click.

**Download `Drag-Trainer.exe` below and run it.** There's no installer. Windows may show a "Windows protected your PC" warning the first time because the app isn't code-signed; click **More info → Run anyway**. The [README](https://github.com/urmamge/drag-trainer#is-it-safe) explains why and how to check the file yourself.

### What's in it
- **Timed CPS tests** from 0.5 to 60 seconds, left or right click, with history and best scores
- **Drag practice mode** that counts clicks per drag, with a bar for every drag
- **Coach** that gives feedback on each drag and a report on each session
- **Practice sessions and reminders**: guided 10-minute sessions of 10s drag / 10s rest sets, with Windows notifications when your next session is due
- **How to drag click** guide, from picking a mouse to grip tape

### Checking the download
This exe was built by GitHub Actions straight from the tagged source code. `SHA256SUMS.txt` has its checksum, and the build is attested by GitHub:

```
gh attestation verify Drag-Trainer.exe --repo urmamge/drag-trainer
```
