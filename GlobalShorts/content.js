// Global Shorts Studio - Web-Extension Bridge Content Script

// 1. 핸드셰이크 응답 (웹앱 감지용)
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  
  if (event.data && event.data.type === "GSS_PING") {
    window.postMessage({
      source: "GSS_EXTENSION",
      type: "GSS_PONG"
    }, "*");
  }
});

// 2. 메시지 중계 (웹앱 -> 백그라운드 -> 웹앱)
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  
  if (event.data && event.data.source === "GSS_WEB_APP") {
    const requestData = event.data;
    
    // Background Service Worker로 메시지 전달
    chrome.runtime.sendMessage(requestData, (response) => {
      // 결과를 다시 웹페이지로 송신
      window.postMessage({
        source: "GSS_EXTENSION",
        requestId: requestData.requestId,
        type: requestData.type + "_RESPONSE",
        response: response
      }, "*");
    });
  }
});
