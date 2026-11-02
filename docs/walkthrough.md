# Walkthrough script (≈75 seconds)

Run `npm run build && npm start` and open http://localhost:4173 at desktop
size. Every step below is a real interaction. Timings are approximate.

**0:00 – Opening (10 s)**
"This is Atmos, a learning prototype. The map is MapLibre GL on an OpenFreeMap
basemap, and this is real composite radar from RainViewer, the latest frame.
Top right shows when the provider generated the frame list. The label bottom
right says *Latest* with the UTC time of the frame actually drawn."

**0:10 – Playback (15 s)**
Click **Play**. "Playback walks the last two hours in ten-minute steps. It's
paced by what is actually drawn: if a frame isn't loaded yet, the old frame
stays up and the label says *Loading*, and the provider's 100-requests-a-minute
limit is tracked here (point at the req/min meter)." Click **2×**, then
**Pause**.

**0:25 – Scrubbing and keyboard (12 s)**
Drag the timeline slider back and forth quickly. "Scrubbing pauses playback,
and only the frame I land on is ever swapped in, never a stale one." Focus the
slider, press **→** twice, then **L**. "Arrow keys step, L jumps back to the
latest frame."

**0:37 – Layers (13 s)**
Drag **Opacity** down to about 40 %. Toggle **Radar coverage mask** on. "The
grey veil is RainViewer's documented coverage mask. No colour there means no
data, not dry weather." Toggle **Radar imagery** off and on.

**0:50 – Regions (10 s)**
Click **Europe**, then **UK**. "Region presets fly the camera. Queued work for
the old view is cancelled." Click **Reset view**.

**1:00 – Location and sample annotation (12 s)**
Click inside a radar echo. "Coordinates, displayed frame, active layers, and a
qualitative radar state: never a fabricated rainfall value." Click the
**London (sample point)** marker. "The violet features are clearly labelled
sample annotations, not observations or alerts."

**1:12 – Close (6 s)**
Point at the legend. "The legend is generated from the provider's published
Universal Blue colour table, in dBZ. Attribution is on the map. And it's a
static export, ready for S3 and CloudFront."
