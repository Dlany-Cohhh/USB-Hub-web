#!/bin/sh
set -e

# Usage:
# ./scripts/build-and-push.sh your-registry/mqtt-usb-hub:latest

IMAGE_NAME=${1:-your-docker-registry/mqtt-usb-hub:latest}

echo "Building image: ${IMAGE_NAME}"
docker build -t "${IMAGE_NAME}" .

echo "Pushing image: ${IMAGE_NAME}"
docker push "${IMAGE_NAME}"

echo "Done."


