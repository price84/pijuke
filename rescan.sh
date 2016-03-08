#!/bin/bash -x

xmms2 stop
xmms2 playlist clear
xmms2 add /media/usb
xmms2 playlist shuffle
sleep 2
xmms2 play
xmms2 next
