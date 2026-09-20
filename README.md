# Thumbnails for IINA

An IINA plugin that shows clickable thumbnails for each video.

![Thumbnails preview](screenshots/screenshot.png)

## Features

- See a grid of thumbnails from across the video
- Click a thumbnail to jump to that point
- Choose 10, 15, 20, 30, 40, 60, or 100 thumbnails
- Change the number of thumbnails with a simple slider
- Turn background blur on or off
- Uses IINA's own thumbnail cache, so it does not create another thumbnail cache
- The grid updates while you resize the IINA window

## Install

### From IINA

Open:

**IINA → Settings → Plugins → Install from GitHub…**

Enter:

`aminozuur/iina-thumbnails`

### From a release

Download the latest `.iinaplgz` file from the [Releases](https://github.com/aminozuur/iina-thumbnails/releases) page and open it with IINA.

## Permissions

Thumbnails needs two IINA permissions:

- **Access the file system** — reads IINA's thumbnail cache.
- **Add overlays on videos** — shows the thumbnails and controls on top of the video.

## Author

**Amin Eftegarie**

Email: [amin@eftegarie.com](mailto:amin@eftegarie.com)  
Website: [eftegarie.com](https://eftegarie.com/)

## License

[MIT License](LICENSE.md)
