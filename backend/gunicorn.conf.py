bind = "unix:/home/wumbl3priv/Dev/WeComment/instance/wecomment.sock"
workers = 4
chdir = "/home/wumbl3priv/Dev/WeComment"
wsgi_app = "backend.app:app"
timeout = 60
umask = 0o007
user = "wumbl3priv"
group = "www-data"
accesslog = "/home/wumbl3priv/Dev/WeComment/instance/gunicorn.access.log"
errorlog = "/home/wumbl3priv/Dev/WeComment/instance/gunicorn.error.log"
loglevel = "info"
capture_output = True
pidfile = "/home/wumbl3priv/Dev/WeComment/instance/gunicorn.pid"


