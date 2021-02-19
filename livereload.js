(() => {
  const socketUrl = "ws://localhost:8091";

  let socket = new WebSocket(socketUrl);
  socket.addEventListener("close", () => {
    const attemptTimeout = 100;
    const disconnectedTimeout = 3000;
    const maxAttempts = Math.round(disconnectedTimeout / attemptTimeout);

    let attempts = 0;
    const reload = () => {
      console.log('attempt');
      attempts++;
      if (attempts > maxAttempts) {
        console.error("Unable to reconnect to the dev server");
        return;
      }

      socket = new WebSocket(socketUrl);
      socket.addEventListener("error", () => {
        setTimeout(reload, attemptTimeout);
      });
      socket.addEventListener("open", () => {
        location.reload();
      });
    };

    reload();
  });
})();
