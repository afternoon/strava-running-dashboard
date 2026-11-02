# App icon

`AppIcon.svg` is the source for the iOS app icon: a white runner on Strava orange (#FC4C02).

To regenerate the 1024px PNG in the asset catalog, render the SVG at 1024x1024, for example with headless Chrome:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1024,1024 \
  --screenshot=StravaRunning/StravaRunning/Assets.xcassets/AppIcon.appiconset/AppIcon.png AppIcon.svg
```
