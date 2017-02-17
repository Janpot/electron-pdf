FROM iojs:3.0

WORKDIR /opt

RUN apt-get update && \
  apt-get install -y libgconf2-4 libxtst6 libnss3 libasound2 xvfb dbus-x11 libgtk2.0-common libxss1
RUN npm install -g electron-prebuilt

COPY ./package.json /opt/package.json
RUN npm install

COPY ./run.sh /opt/run.sh
COPY ./lib/ /opt/lib/

CMD [ "sh", "/opt/run.sh" ]
