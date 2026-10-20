#!/bin/zsh
# Atajo en Mac y Linux de ui/arrancar.py (el arranque de la interfaz, igual en Mac, Windows y Linux):
#   ui/arrancar.sh [dev|compilar|comprobar]   (ver ui/arrancar.py)
UI="${0:A:h}"
exec "${UI:h}/.venv/bin/python" "$UI/arrancar.py" "$@"
