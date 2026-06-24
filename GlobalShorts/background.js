// 확장 프로그램 아이콘을 클릭하면 팝업 대신 오른쪽 사이드 패널이 열리도록 통제합니다.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// 🔌 웹페이지 통신 브릿지 및 CORS 우회 스크래퍼 백그라운드 구동 로직
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source === "GSS_WEB_APP") {
    
    // 1. 샤오홍슈 무료 스크래핑 액션
    if (message.type === "FETCH_XHS") {
      const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(message.keyword)}`;
      
      fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP 에러: ${response.status}`);
        return response.text();
      })
      .then(html => {
        // window.__INITIAL_STATE__ 파싱
        const match = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})(?=<\/script>|;)/);
        if (!match) {
          // 로그인 차단 벽 또는 캡차 감지인 경우
          if (html.includes("login") || html.includes("sliding") || html.includes("verification")) {
            throw new Error("🔒 샤오홍슈 보안 문자(캡차) 또는 로그인 만료가 감지되었습니다. 브라우저에서 샤오홍슈(xiaohongshu.com) 사이트에 접속해 로그인 또는 슬라이드 인증을 완료한 후 다시 시도해 주세요!");
          }
          throw new Error("결과 파싱 실패 (INITIAL_STATE를 찾을 수 없음)");
        }
        
        try {
          // undefined 값을 null로 보정하여 JSON 파싱 에러 방지
          const cleanJsonText = match[1].replace(/:\s*undefined/g, ": null");
          const stateObj = JSON.parse(cleanJsonText);
          
          const notes = findNotesList(stateObj);
          if (notes && notes.length > 0) {
            sendResponse({ success: true, data: notes });
          } else {
            sendResponse({ success: false, error: "검색 결과가 없거나 구조가 맞지 않습니다." });
          }
        } catch (jsonErr) {
          sendResponse({ success: false, error: `JSON 파싱 실패: ${jsonErr.message}` });
        }
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      
      return true; // 비동기 응답 처리
    }

    // 1-2. 샤오홍슈 상세페이지 비디오 URL 추출 액션
    if (message.type === "GET_VIDEO_URL") {
      const detailUrl = `https://www.xiaohongshu.com/explore/${message.noteId}`;
      
      fetch(detailUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP 에러: ${response.status}`);
        return response.text();
      })
      .then(html => {
        const match = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})(?=<\/script>|;)/);
        if (!match) throw new Error("상세 페이지 파싱 실패 (INITIAL_STATE 없음)");
        
        try {
          const cleanJsonText = match[1].replace(/:\s*undefined/g, ": null");
          const stateObj = JSON.parse(cleanJsonText);
          const videoUrl = findVideoUrl(stateObj);
          
          if (videoUrl) {
            sendResponse({ success: true, videoUrl: videoUrl });
          } else {
            sendResponse({ success: false, error: "이 게시물은 비디오가 아닌 일반 이미지 카드뉴스입니다." });
          }
        } catch (jsonErr) {
          sendResponse({ success: false, error: `상세 JSON 파싱 실패: ${jsonErr.message}` });
        }
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      
      return true; // 비동기 응답 처리
    }
    
    // 2. 비디오 강제 다운로드 액션 (CORS 우회 및 파일명 지정)
    if (message.type === "DOWNLOAD_VIDEO") {
      chrome.downloads.download({
        url: message.url,
        filename: message.filename,
        saveAs: false,
        conflictAction: "overwrite"
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId: downloadId });
        }
      });
      
      return true; // 비동기 응답 처리
    }
  }
});

// JSON 구조 내에서 노트 배열을 재귀적으로 찾는 헬퍼 함수
function findNotesList(obj) {
  if (!obj || typeof obj !== 'object') return null;
  
  if (Array.isArray(obj)) {
    if (obj.length > 0) {
      const first = obj[0];
      // 노트 객체의 특징적인 키(id, noteId, note_id, note)가 있는지 검증
      if (first && typeof first === 'object' && (first.id || first.noteId || first.note_id || first.note)) {
        return obj;
      }
    }
  }
  
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      const found = findNotesList(obj[key]);
      if (found) return found;
    }
  }
  return null;
}

// JSON 구조 내에서 비디오 주소를 재귀적으로 찾는 헬퍼 함수
function findVideoUrl(obj) {
  if (!obj || typeof obj !== 'object') return null;
  
  if (obj.masterUrl && typeof obj.masterUrl === 'string' && obj.masterUrl.startsWith('http')) return obj.masterUrl;
  if (obj.master_url && typeof obj.master_url === 'string' && obj.master_url.startsWith('http')) return obj.master_url;
  
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      const found = findVideoUrl(obj[key]);
      if (found) return found;
    }
  }
  return null;
}