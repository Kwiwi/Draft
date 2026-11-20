import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Native PDF export (offline edition only): android-plugin/PrintPlugin.kt.
// Wrapped so builds without the native class simply fall back to sharing HTML.
const Print = registerPlugin('Print');

window.DraftNative = {
  Capacitor,
  App,
  Filesystem,
  Directory,
  Encoding,
  Share,
  Print
};
