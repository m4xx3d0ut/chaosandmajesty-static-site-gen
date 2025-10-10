---
title: FFmpeg Production Recipes
slug: ffmpeg-recipes
author: m4xx3d0ut
summary: Handy FFmpeg CLI snippets for clipping, transcoding, looping stills, generating
  test patterns, and burning in timecode.
tags:
- m4xx3d
- ffmpeg
- video
- media
- automation
publishedAt: 2023-10-20
updatedAt: 2025-02-02
---
## TLDR;

- Use `-ss`/`-t` with `-c copy` to clip segments without re-encoding, and rely on `libx264`/`libx265` (or `h264_nvenc`) when you need transcodes.
- Loop still images or test patterns with `-loop 1` and `lavfi` sources, then concat segments via a manifest to reach longer runtimes.
- The `drawtext` filter handles timecode overlays; remember to point to a valid font and position text with expressions like `(w-tw)/2`.

## Working Notes... In Graphic Detail...

### Transcode 4K MOV to 1080p H.264 AAC

```bash
ffmpeg -i input.mov -vf "scale=1920:1080" -c:v libx264 -crf 23 -c:a aac -b:a 192k output.mp4
```

Hardware-accelerated NVENC variant:
```bash
ffmpeg -i input.mov -vf "scale=1920:1080" -c:v h264_nvenc -rc:v vbr_hq -b:v 8M -pix_fmt yuv420p -c:a aac -b:a 192k output.mp4
```

Reduce file size with HEVC:
```bash
ffmpeg -i input.mp4 -c:v libx265 -crf 28 -c:a copy output.mp4
```

Batch transcode current directory to an `out/` folder:
```bash
mkdir -p out
for file in "$(pwd)"/*; do
  [ -f "$file" ] || continue
  ffmpeg -y -i "$file" -c:v libx264 -crf 28 -c:a copy "$(pwd)"/out/"${file##*/}"
done
```

### Clip a Segment

```bash
ffmpeg -ss 00:00:00 -t 00:00:20 -i input.mp4 -c copy output.mp4
```

### 1-Minute SCTE Test Pattern (MJPEG)

```bash
ffmpeg -f lavfi -i testsrc=size=1920x1080:rate=30 -t 60 -c:v mjpeg -an output_test_pattern.mjpeg
```

### 1 kHz Audio Tone (60 seconds)

```bash
ffmpeg -f lavfi -i sine=frequency=1000:duration=60 -c:a pcm_s16le audio.wav
```

### Bouncing Ball Test Pattern (excerpt)

Generate a five-minute MJPEG test clip with moving graphics:
```bash
ffmpeg -f lavfi -i "testsrc=size=1920x1080:rate=30" \
       -f lavfi -i "life=s=1920x1080:mold=10:r=30:ratio=0.1:death_color=black:life_color=white" \
       -filter_complex "overlay" -t 300 -c:v mjpeg -an bouncing-ball.mjpeg
```

### Loop a Single Image

Resize as needed (ImageMagick):
```bash
convert input.png -resize 1920x1080 frame.png
```

Build a 10-minute, 30 FPS loop:
```bash
ffmpeg -loop 1 -i frame.png -t 600 -r 30 -pix_fmt yuv420p loop-10min.mp4
```

Concatenate six loops into an hour-long clip:
```bash
for i in {1..6}; do echo "file 'loop-10min.mp4'" >> concat.lst; done
ffmpeg -f concat -safe 0 -i concat.lst -c copy loop-60min.mp4
```

### Burn-In Timecode

Top-left overlay (adjust font path):
```bash
ffmpeg -i input.mp4 -vf "drawtext=fontfile=/path/to/font.ttf:fontsize=32:fontcolor=white:\
  box=1:boxcolor=black@0.5:boxborderw=5:text='%{pts\:hms}':x=20:y=20" -c:a copy output.mp4
```

Centered overlay with golden-ratio offset:
```bash
ffmpeg -i input.mp4 -vf "drawtext=fontfile=/path/to/font.ttf:fontsize=48:fontcolor=white:\
  box=1:boxcolor=black@0.5:boxborderw=5:text='%{pts\:hms}':x=(w-tw)/2:y=(h/PHI)+th" -c:a copy output.mp4
```

Sample grabbing from an HLS stream and exporting a 20-second clip with timecode:
```bash
ffmpeg -ss 00:04:30 -t 20 -i https://example.com/endpoint/index.m3u8 \
  -vf "drawtext=fontsize=48:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=5:\
  text='%{pts\:hms}':x=(w-tw)/2:y=(h/PHI)+th" -c:a copy clip-with-tc.mp4
```

### Quick Reference Commands

- Create an MJPEG video test card and matching sine-wave audio tone for end-to-end testing.
- Loop a still image via `-loop 1` and use the concat demuxer to extend the runtime.
- Clip segments with `-ss`/`-t`, preserving audio with `-c:a copy`.
- Switch between software (`libx264`, `libx265`) and hardware (`h264_nvenc`) encoders depending on the workstation.
