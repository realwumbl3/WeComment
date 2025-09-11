from backend import app, create_app, db, Video

print(app)

app_context = app.app_context()
app_context.push()



all_videos = db.session.query(Video).all()
for video in all_videos:
    print("--------------------------------")
    print(video.id)
    print(video.title)
    print(video.youtube_video_id)
    print(video.yt_comments_disabled)
    print("--------------------------------")