# Drag Trainer

**HAVE YOU EVER wanted to learn how to drag click?!**

Are you TIRED of mashing your mouse and getting a measly 8 CPS? Do you slide your finger across the button, full of hope, only to get... *two clicks*?! Are your friends out-clicking you, out-bridging you, out-*everything*-ing you?

**WELL, I'VE GOT THE APP FOR YOU!**

Introducing **Drag Trainer**! It counts **every click in every drag**, has a **coach** that tells you what went wrong, **reminds you when to practise** (and when to STOP), and comes with a **step-by-step guide** to get you started!

*But wait, there's more!* It's **completely FREE**, it's **open source**, and there's **no installer**: just download it and click!

**Order now!** *(Please don't phone anyone. It's a GitHub release.)*

![Drag practice mode with per-drag bars and the coach](docs/drag-practice.png)

---

## Why I made this

Okay, the infomercial voice was a joke, but this part isn't. I made Drag Trainer because I couldn't drag click. I'd watched people do it, bought grip tape, and tried for ages, and I still only got two clicks a drag. Online guides all said the same thing ("just drag your finger across it"), and none of them helped me work out what *I* was doing wrong.

So I built the tool I wished I'd had: one that counts the clicks in every drag, shows whether I'm getting better, and gives me an idea of what to change. I'm still learning with it myself. If you're stuck at two clicks too, I hope it helps you as much as it's helping me.

## What it does

- **Timed CPS tests.** 0.5 to 60 seconds, left or right click, with history and a best score for each length.
- **Drag practice mode.** There's no timer: it counts the clicks in each drag and draws a bar for each one, so you can see how consistent you are.
- **Coach.** It reacts to every drag ("New best drag: 11 clicks! Copy exactly what you just did") and writes a session report: inconsistent drags, drags that stall partway, fading as you tire, standout drags worth copying, and whether slow resets are holding your CPS back.
- **Practice sessions and reminders.** Guided 10-minute sessions of 10 seconds dragging, 10 seconds resting. While the app is open, it sends a Windows notification when your next session is due and tells you when to stop.
- **How to drag click.** A built-in guide covering which mice can do it, finger position, pressure, consistency, resets and grip tape.

*Coming soon: [hand tracking](#hand-tracking-to-diagnose-your-issues) that watches your drags through your webcam and tells you what to fix.*

| Timed test | Guide |
|---|---|
| ![Timed test result](docs/timed.png) | ![How to drag click guide](docs/guide.png) |

## Install

Drag Trainer is for **Windows 10 and 11**.

1. Go to the [latest release](https://github.com/urmamge/drag-trainer/releases/latest) and download **`Drag-Trainer.exe`**.
2. Double-click it. There's nothing to install; the exe *is* the app. You can keep it anywhere, such as your Desktop or Documents.
3. **If Windows shows "Windows protected your PC"**, click **More info**, then **Run anyway**. You only need to do this once. [Why does this happen?](#why-does-windows-warn-me)
4. It takes a few seconds to open, because it unpacks itself each time it starts.

Keep it open (minimizing is fine) if you want practice reminders. Closing the window quits it completely; nothing keeps running in the background.

**To uninstall:** delete `Drag-Trainer.exe`. To also remove your scores and practice history, delete the `%APPDATA%\Drag Trainer` folder.

## Is it safe?

Downloading an exe from GitHub should make you a bit suspicious, so here's everything you need to decide for yourself.

**What it does and doesn't do**

- It doesn't need admin rights and doesn't change any system settings.
- It makes no network requests of its own. There's no telemetry, no accounts and no ads. The only link is the "Support me on Ko-fi" button, which opens the page in your normal browser when you click it.
- Your scores and practice history are saved only on your PC, in `%APPDATA%\Drag Trainer`.
- It doesn't read your clicks outside its own window. It only counts clicks on the grey pad.

**You can check the download came from this code**

- **All the code is here.** It's a small Electron app; the logic is in [`src/`](src) and the interface is in [`static/`](static).
- **GitHub builds the exe, not me.** Releases are built by [GitHub Actions](.github/workflows/release.yml) on GitHub's own servers, straight from the tagged source. You can see the build log for every release in the [Actions tab](https://github.com/urmamge/drag-trainer/actions).
- **Every build is attested.** GitHub signs a record that says which repo, commit and workflow produced the exe. With the [GitHub CLI](https://cli.github.com/) installed, check your download with:
  ```
  gh attestation verify Drag-Trainer.exe --repo urmamge/drag-trainer
  ```
- **Checksum.** Each release includes `SHA256SUMS.txt`. Compare it with your download in PowerShell:
  ```powershell
  Get-FileHash .\Drag-Trainer.exe -Algorithm SHA256
  ```
- **Scan it yourself.** Upload the exe to [VirusTotal](https://www.virustotal.com/) to have dozens of antivirus engines check it.
- **Or don't trust the exe at all**, and [build it yourself](#build-it-yourself) from the source.

### Why does Windows warn me?

Windows SmartScreen warns about any program that isn't **code-signed** and hasn't been downloaded by lots of people yet. A code-signing certificate costs hundreds of pounds a year, which doesn't make sense for a free hobby project. The warning means "Windows doesn't know who made this", not "this is a virus". The checks above let you confirm that for yourself.

## Build it yourself

You need [Node.js](https://nodejs.org/) 22 or newer.

```
git clone https://github.com/urmamge/drag-trainer.git
cd drag-trainer
npm ci
npm start          # run it straight from the source
npm run dist       # or build release/Drag-Trainer.exe
```

If `npm start` complains that Electron failed to install, newer npm versions block install scripts by default. Run `node node_modules/electron/install.js` once, then try again.

## The science bit

The practice schedule is based on motor-learning research, not guesswork:

- **10s drag / 10s rest sets.** Early skill gains mostly happen during short rests between practice, not during the practice itself ([Bönstrup et al., 2019, *Current Biology*](https://doi.org/10.1016/j.cub.2019.02.049)).
- **Short sessions, spread out.** Spaced-out practice beats long sessions for motor skills ([Lee & Genovese, 1988](https://doi.org/10.1080/02701367.1988.10609373)), and drag clicking is hard on your hand.
- **6+ hours apart, at most 2 a day.** New motor skills take hours to settle in ([Shadmehr & Brashers-Krug, 1997](https://doi.org/10.1523/JNEUROSCI.17-01-00409.1997)) and keep improving overnight while you sleep ([Walker et al., 2002](https://doi.org/10.1016/S0896-6273(02)00746-8)).

The exact numbers (10 minutes, 6 hours, 2 a day) are my choices based on those findings; the studies don't prescribe them for drag clicking specifically.

The coach only knows *when* each click happened. It can't see your finger, so its tips describe the most likely cause rather than a certain one.

## A word of warning

Some game servers limit or flag very high CPS. Check the rules where you play before you show off your new skills.

## Future add-ons

### Hand tracking to diagnose your issues

The coach can only see *when* your clicks happen, not *why*. Hand tracking would fix that. With your permission, Drag Trainer would use your webcam to watch your hand while you drag. It would then tell you exactly what you're doing wrong, such as your finger angle being too flat, dragging too fast or too slow, starting in a different spot each time, or your finger lifting partway through. Then it would show you how your best drags differ from your worst ones.

## License

[MIT](LICENSE)
