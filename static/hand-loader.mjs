// The renderer is a classic script, so this small module loads the hand tracker
// (an ES module) on demand and hands it over on window.
import { FilesetResolver, HandLandmarker } from './vendor/mediapipe/vision_bundle.mjs';

window.mpVision = { FilesetResolver, HandLandmarker };
window.dispatchEvent(new Event('mpready'));
