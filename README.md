# electron-pdf

Pdf rendering service with [electron](http://electron.atom.io/)

## Usage

With Docker:

```sh
$ docker run -p 3000:3000 janpot/electron-pdf
```

Run locally

```sh
$ npm i -g electron-prebuilt
$ electron .
```

## API

### `GET /:url`

`url`: Absolute url to the webpage you want to have rendered.

```sh
$ curl http://localhost:3000/https://www.google.com > google.pdf
```

<hr>

### `POST /`

Send a html string as the request body.

```sh
$ curl -d "<div>test</div>" http://localhost:3000/ > test.pdf
```
