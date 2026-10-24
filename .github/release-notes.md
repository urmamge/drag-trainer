**Hand tracking is here.** Point your phone's camera at your mouse hand, and after every drag Drag Trainer tells you what your finger did.

**Download `Drag-Trainer.exe` below and run it.** There's no installer. Windows may show a "Windows protected your PC" warning the first time because the app isn't code-signed; click **More info → Run anyway**. The [README](https://github.com/urmamge/drag-trainer#is-it-safe) explains why and how to check the file yourself.

Don't want camera features? [v1.0.0](https://github.com/urmamge/drag-trainer/releases/tag/v1.0.0) has everything except hand tracking and replays, and stays available. Both versions share the same saved scores.

### New in v1.1.0
- **Hand tracking.** Use a phone (recommended) or webcam to film your hand side-on. After each drag, the Coach reports your finger angle, start spot, drag length and speed, and whether your fingertip lifted.
- **Learns what works for you.** After 8 tracked drags it compares your best and worst drags, e.g. "your best drags start in the front third of the button, at around 45°". The session report sums up what your best drags do differently, and a green circle on the preview marks where to start.
- **Drag replays.** Optionally record your drags. The app keeps your 3 best and 3 worst from each session, says what made each one good or bad, and lets you watch them back in slow motion or frame by frame with every click marked. Each tracking marking can be switched on or off, or hide them all to see just your hand.
- **Phone camera setup guide** inside the app (Hand tracking button) and in the [README](https://github.com/urmamge/drag-trainer#hand-tracking-setup).
- **Private by design:** video is analysed live on your PC and never sent anywhere. It's only saved if you turn on recording, and then only as short clips on your PC. The app only uses the camera when you turn it on, and never the microphone.

The camera can't see pressure, so it can't catch everything, and distances in cm are rough estimates based on an average hand size.

### Checking the download
This exe was built by GitHub Actions straight from the tagged source code. `SHA256SUMS.txt` has its checksum, and the build is attested by GitHub:

```
gh attestation verify Drag-Trainer.exe --repo urmamge/drag-trainer
```
