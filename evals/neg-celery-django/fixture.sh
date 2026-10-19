#!/bin/bash
set -e
mkdir -p "$(dirname 'manage.py')"
cat > 'manage.py' <<'__EOF__'
#!/usr/bin/env python
import os, sys
if __name__ == '__main__':
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'site.settings')

__EOF__
mkdir -p "$(dirname 'requirements.txt')"
cat > 'requirements.txt' <<'__EOF__'
django==5.1
celery==5.4
redis==5.0
__EOF__
mkdir -p "$(dirname 'site/settings.py')"
cat > 'site/settings.py' <<'__EOF__'
INSTALLED_APPS = ['django.contrib.auth']
CELERY_BROKER_URL = 'redis://localhost:6379/0'
__EOF__
mkdir -p "$(dirname 'users/signals.py')"
cat > 'users/signals.py' <<'__EOF__'
# user created signal handlers live here
__EOF__
