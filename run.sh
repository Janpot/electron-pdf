#!/bin/sh

export DISPLAY=:0

# Start dbus
mkdir -p /var/run/dbus
/usr/bin/dbus-daemon --session --fork

# Start xvfb
/usr/bin/Xvfb $DISPLAY -ac -screen 0 1920x1080x24 +extension RANDR &

# Give time to dbus & Xvfb to boot
sleep 1

# Start application
/usr/local/bin/electron /opt
