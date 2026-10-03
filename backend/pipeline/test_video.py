from sources.video_source import VideoSource


VIDEO = "../videos/traffic.mp4"

source = VideoSource(VIDEO)

print("Video opened")
print("FPS:", source.fps)
print("Resolution:", source.width, "x", source.height)

for i in range(10):
    frame = source.read()

    if frame is None:
        print("Video ended")
        break

    print(f"Frame {i + 1}: OK")

source.release()