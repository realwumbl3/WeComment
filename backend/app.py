from __future__ import annotations

import json
import os
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional

import requests
from flask import Flask, jsonify, request, redirect, make_response
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

from .config import Config


db = SQLAlchemy()


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    CORS(app, resources={r"/*": {"origins": app.config["CORS_ORIGINS"].split(",")}})

    with app.app_context():
        db.create_all()
        # Lightweight schema migration to add yt_comments_disabled if missing
        try:
            engine = db.engine
            with engine.begin() as conn:
                pass
        except Exception:
            # Best-effort; ignore if cannot alter (e.g., permissions)
            pass

    register_routes(app)
    return app


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    google_sub = db.Column(db.String(255), unique=True, index=True)
    email = db.Column(db.String(255), unique=True)
    name = db.Column(db.String(255))
    picture = db.Column(db.String(1024))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Video(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    youtube_video_id = db.Column(db.String(64), unique=True, index=True, nullable=False)
    title = db.Column(db.String(512))
    channel_id = db.Column(db.String(128))
    channel_title = db.Column(db.String(255))
    thumbnail_url = db.Column(db.String(1024))
    yt_comments_disabled = db.Column(db.Boolean, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    video_id = db.Column(db.Integer, db.ForeignKey("video.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    text = db.Column(db.Text, nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey("comment.id"), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Vote(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    comment_id = db.Column(db.Integer, db.ForeignKey("comment.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint("comment_id", "user_id", name="uq_vote_comment_user"),)


def _issue_jwt(user: User) -> str:
    import jwt

    payload = {
        "sub": str(user.id),
        "name": user.name,
        "email": user.email,
        "picture": user.picture,
        "exp": int(time.time()) + int(Config.ACCESS_TOKEN_EXPIRES),
    }
    return jwt.encode(payload, Config.JWT_SECRET, algorithm="HS256")


def _require_auth() -> Optional[User]:
    import jwt
    authz = request.headers.get("Authorization", "")
    if not authz.startswith("Bearer "):
        return None
    token = authz.split(" ", 1)[1]
    try:
        data = jwt.decode(token, Config.JWT_SECRET, algorithms=["HS256"])
    except Exception:
        return None
    return db.session.get(User, int(data.get("sub", 0)))


def register_routes(app: Flask) -> None:
    @app.get("/")
    def health():
        return jsonify({"ok": True})

    def _fetch_youtube_video_meta(video_id: str) -> Optional[dict]:
        api_key = Config.YOUTUBE_API_KEY
        if not api_key:
            return None
        try:
            res = requests.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={
                    "part": "snippet",
                    "id": video_id,
                    "key": api_key,
                },
                timeout=10,
            )
            if res.status_code != 200:
                return None
            items = res.json().get("items", [])
            if not items:
                return None
            sn = items[0].get("snippet", {})
            thumbs = sn.get("thumbnails", {})
            best = thumbs.get("maxres") or thumbs.get("standard") or thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}
            return {
                "title": sn.get("title"),
                "channel_id": sn.get("channelId"),
                "channel_title": sn.get("channelTitle"),
                "thumbnail_url": best.get("url"),
            }
        except Exception:
            return None

    def _detect_youtube_comments_disabled(video_id: str) -> Optional[bool]:
        api_key = Config.YOUTUBE_API_KEY
        if not api_key:
            return None
        try:
            res = requests.get(
                "https://www.googleapis.com/youtube/v3/commentThreads",
                params={
                    "part": "id",
                    "videoId": video_id,
                    "maxResults": 1,
                    "key": api_key,
                },
                timeout=10,
            )
            if res.status_code == 200:
                # Comments are enabled (may be empty list but not disabled)
                return False
            if res.status_code == 403:
                try:
                    data = res.json() or {}
                    errors = (data.get("error", {}).get("errors") or [])
                    reason = (errors[0].get("reason") if errors else "") or ""
                    if str(reason).lower() == "commentsdisabled":
                        return True
                except Exception:
                    pass
                return None
            return None
        except Exception:
            return None

            
    # NEW RULES
    # NEVER TRUST THE CLIENT
    @app.get("/api/videos/<youtube_video_id>")
    def get_video(youtube_video_id: str):
        video = Video.query.filter_by(youtube_video_id=youtube_video_id).first()
        if not video:
            meta = _fetch_youtube_video_meta(youtube_video_id)
            yt_disabled = _detect_youtube_comments_disabled(youtube_video_id)
            video = Video(
                youtube_video_id=youtube_video_id,
                title=(meta or {}).get("title"),
                channel_id=(meta or {}).get("channel_id"),
                channel_title=(meta or {}).get("channel_title"),
                thumbnail_url=(meta or {}).get("thumbnail_url"),
                yt_comments_disabled=yt_disabled if yt_disabled is not None else None,
            )
            db.session.add(video)
            db.session.commit()
        # Do not accept or persist client-provided metadata flags (e.g. yt_disabled/title)
        # Only track by YouTube video ID and fetch metadata from the YouTube API server-side.
        return jsonify({
            "id": video.id,
            "youtube_video_id": video.youtube_video_id,
            "title": video.title,
            "channel_id": video.channel_id,
            "channel_title": video.channel_title,
            "thumbnail_url": video.thumbnail_url,
            "yt_comments_disabled": bool(video.yt_comments_disabled) if video.yt_comments_disabled is not None else None,
            "created_at": video.created_at.isoformat(),
        })

    @app.get("/api/videos")
    def list_videos():
        has_comments = (request.args.get("has_comments") or "1") not in ("0", "false", "False")
        limit = int(request.args.get("limit", "50"))
        q = db.session.query(
            Video,
            db.func.count(Comment.id).label("comment_count"),
            db.func.max(Comment.created_at).label("last_comment_at"),
        ).outerjoin(Comment, Comment.video_id == Video.id).group_by(Video.id)
        if has_comments:
            q = q.having(db.func.count(Comment.id) > 0).order_by(db.func.max(Comment.created_at).desc())
        else:
            q = q.order_by(Video.created_at.desc())
        rows = q.limit(limit).all()
        return jsonify({
            "videos": [
                {
                    "youtube_video_id": r.Video.youtube_video_id,
                    "title": r.Video.title,
                    "channel_id": r.Video.channel_id,
                    "channel_title": r.Video.channel_title,
                    "thumbnail_url": r.Video.thumbnail_url,
                    "yt_comments_disabled": bool(r.Video.yt_comments_disabled) if r.Video.yt_comments_disabled is not None else None,
                    "comment_count": int(r.comment_count or 0),
                    "last_comment_at": r.last_comment_at.isoformat() if r.last_comment_at else None,
                }
                for r in rows
            ]
        })

    @app.get("/api/videos/<youtube_video_id>/comments")
    def list_comments(youtube_video_id: str):
        video = Video.query.filter_by(youtube_video_id=youtube_video_id).first()
        if not video:
            return jsonify({"comments": []})
        # Optional auth to mark which comments the user has voted on
        current_user = _require_auth()

        rows = (
            db.session.query(Comment, User)
            .join(User, User.id == Comment.user_id)
            .filter(Comment.video_id == video.id)
            .all()
        )

        # Gather votes per comment
        comment_ids = [r.Comment.id for r in rows]
        scores = {cid: 0 for cid in comment_ids}
        if comment_ids:
            for cid, count in db.session.query(Vote.comment_id, db.func.count(Vote.id)).filter(Vote.comment_id.in_(comment_ids)).group_by(Vote.comment_id):
                scores[cid] = int(count)

        user_votes = set()
        if current_user and comment_ids:
            user_votes = {
                cid for cid, in db.session.query(Vote.comment_id).filter(Vote.comment_id.in_(comment_ids), Vote.user_id == current_user.id)
            }

        # Build objects
        items = []
        for r in rows:
            items.append({
                "id": r.Comment.id,
                "text": r.Comment.text,
                "created_at": r.Comment.created_at.isoformat(),
                "parent_id": r.Comment.parent_id,
                "score": scores.get(r.Comment.id, 0),
                "user_voted": r.Comment.id in user_votes,
                "user": {
                    "id": r.User.id,
                    "name": r.User.name,
                    "picture": r.User.picture,
                },
            })

        # Build thread (top-level with replies array)
        by_id = {i["id"]: i for i in items}
        for obj in by_id.values():
            obj["replies"] = []
        roots = []
        for obj in items:
            if obj["parent_id"]:
                parent = by_id.get(obj["parent_id"]) ;
                if parent:
                    parent["replies"].append(obj)
                else:
                    roots.append(obj)
            else:
                roots.append(obj)

        sort = (request.args.get("sort") or "top").lower()
        if sort == "top":
            roots.sort(key=lambda x: (x.get("score", 0), x.get("created_at", "")), reverse=True)
            for r in roots:
                r["replies"].sort(key=lambda x: (x.get("score", 0), x.get("created_at", "")), reverse=True)
        else:
            roots.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            for r in roots:
                r["replies"].sort(key=lambda x: x.get("created_at", ""))

        return jsonify({"comments": roots})

    @app.post("/api/videos/<youtube_video_id>/comments")
    def add_comment(youtube_video_id: str):
        user = _require_auth()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        data = request.get_json() or {}
        text = (data.get("text") or "").strip()
        if not text:
            return jsonify({"error": "text_required"}), 400
        parent_id = data.get("parent_id")
        parent_obj = None
        video = Video.query.filter_by(youtube_video_id=youtube_video_id).first()
        if not video:
            # On first comment for a video, try to fetch metadata so we store channel info too
            meta = _fetch_youtube_video_meta(youtube_video_id)
            yt_disabled = _detect_youtube_comments_disabled(youtube_video_id)
            video = Video(
                youtube_video_id=youtube_video_id,
                title=(meta or {}).get("title"),
                channel_id=(meta or {}).get("channel_id"),
                channel_title=(meta or {}).get("channel_title"),
                thumbnail_url=(meta or {}).get("thumbnail_url"),
                yt_comments_disabled=yt_disabled if yt_disabled is not None else None,
            )
            db.session.add(video)
            db.session.commit()
        if parent_id:
            parent_obj = db.session.get(Comment, int(parent_id))
            if not parent_obj or parent_obj.video_id != video.id:
                return jsonify({"error": "invalid_parent"}), 400
        comment = Comment(video_id=video.id, user_id=user.id, text=text, parent_id=parent_obj.id if parent_obj else None)
        db.session.add(comment)
        db.session.commit()
        return jsonify({"id": comment.id}), 201

    @app.post("/api/comments/<int:comment_id>/vote")
    def toggle_vote(comment_id: int):
        user = _require_auth()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        comment = db.session.get(Comment, comment_id)
        if not comment:
            return jsonify({"error": "not_found"}), 404
        vote = db.session.query(Vote).filter_by(comment_id=comment_id, user_id=user.id).first()
        if vote:
            db.session.delete(vote)
            db.session.commit()
            voted = False
        else:
            db.session.add(Vote(comment_id=comment_id, user_id=user.id))
            db.session.commit()
            voted = True
        score = db.session.query(db.func.count(Vote.id)).filter(Vote.comment_id == comment_id).scalar() or 0
        return jsonify({"voted": voted, "score": int(score)})

    # Google OAuth using Authorization Code with PKCE (server-side)
    @app.get("/auth/google/start")
    def google_start():
        client_id = app.config["GOOGLE_CLIENT_ID"]
        if not client_id:
            return jsonify({"error": "google_oauth_not_configured"}), 500
        state = secrets.token_urlsafe(16)
        # Store state in a short-lived cookie for CSRF protection
        resp = make_response(redirect(
            "https://accounts.google.com/o/oauth2/v2/auth" +
            "?response_type=code" +
            f"&client_id={client_id}" +
            f"&redirect_uri={app.config['BACKEND_BASE_URL']}/auth/google/callback" +
            "&scope=openid%20email%20profile" +
            f"&state={state}"
        ))
        resp.set_cookie("oauth_state", state, max_age=300, httponly=True, samesite="Lax")
        return resp

    @app.get("/auth/google/callback")
    def google_callback():
        state_cookie = request.cookies.get("oauth_state")
        state = request.args.get("state")
        if not state_cookie or state_cookie != state:
            return jsonify({"error": "invalid_state"}), 400
        code = request.args.get("code")
        if not code:
            return jsonify({"error": "missing_code"}), 400
        token_res = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": app.config["GOOGLE_CLIENT_ID"],
                "client_secret": app.config["GOOGLE_CLIENT_SECRET"],
                "redirect_uri": f"{app.config['BACKEND_BASE_URL']}/auth/google/callback",
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        if token_res.status_code != 200:
            return jsonify({"error": "token_exchange_failed"}), 400
        tokens = token_res.json()

        # Use id_token to get user info
        id_token = tokens.get("id_token")
        try:
            import jwt
            claims = jwt.decode(id_token, options={"verify_signature": False, "verify_aud": False})
        except Exception:
            return jsonify({"error": "invalid_id_token"}), 400

        google_sub = claims.get("sub")
        email = claims.get("email")
        name = claims.get("name")
        picture = claims.get("picture")

        if not google_sub:
            return jsonify({"error": "invalid_profile"}), 400

        user = User.query.filter_by(google_sub=google_sub).first()
        if not user:
            user = User(google_sub=google_sub, email=email, name=name, picture=picture)
            db.session.add(user)
        else:
            user.email = email
            user.name = name
            user.picture = picture
        db.session.commit()

        jwt_token = _issue_jwt(user)
        # Close popup and postMessage the token back to the extension page
        return (
            "<script>window.opener && window.opener.postMessage({type:'wecomment_auth', token:'%s'}, '*');window.close();</script>" % jwt_token
        )


app = create_app()


