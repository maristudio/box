// 파일명 정제기 (ID 제거, 특수문자 제거, 15글자 컷)
function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '').trim().substring(0, 15);
}

document.addEventListener('DOMContentLoaded', function() {
  if(localStorage.getItem('myGeminiKey')) document.getElementById('geminiKey').value = localStorage.getItem('myGeminiKey');
  if(localStorage.getItem('myPartnerLink')) document.getElementById('partnerLink').value = localStorage.getItem('myPartnerLink');
  
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs[0]) {
      const activeUrl = tabs[0].url;
      if (activeUrl && (activeUrl.includes('tiktok.com') || activeUrl.includes('xiaohongshu.com'))) {
        document.getElementById('videoLink').value = activeUrl;
        document.getElementById('workflowArea').classList.remove('hidden');
        document.getElementById('workflowArea').classList.add('fade-in');
      }
    }
  });

  document.getElementById('gearBtn').addEventListener('click', toggleSettings);
  document.getElementById('cancelSettingsBtn').addEventListener('click', toggleSettings);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  
  document.getElementById('tab1Btn').addEventListener('click', () => switchTab(1));
  document.getElementById('tab2Btn').addEventListener('click', () => switchTab(2));
  
  document.getElementById('loadVideoBtn').addEventListener('click', () => {
    document.getElementById('workflowArea').classList.remove('hidden');
    document.getElementById('workflowArea').classList.add('fade-in');
  });
  
  document.getElementById('downloadBtn').addEventListener('click', runSmartDownload);
  document.getElementById('translateBtn').addEventListener('click', runGeminiVideoTranslation);
  
  document.getElementById('searchTrendBtn').addEventListener('click', discoverTrends);
  document.getElementById('refreshTrendBtn').addEventListener('click', discoverTrends);
  
  // 🧹 비우기 버튼 연동
  document.getElementById('clearTrendBtn').addEventListener('click', () => {
    document.getElementById('trendResultsGrid').innerHTML = "";
    document.getElementById('trendResultsArea').classList.add('hidden');
  });
  
  // 📋 복사 버튼 연동
  document.getElementById('copyBtn').addEventListener('click', () => {
    const text = document.getElementById('geminiOutput').innerText;
    if(text) { navigator.clipboard.writeText(text); alert("📋 복사되었습니다!"); }
  });

  // ⌨️ 엔터키 수집 연동 (핵심!)
  document.getElementById('trendKeyword').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      discoverTrends();
    }
  });
  
  document.querySelectorAll('.tag-btn').forEach(button => {
    button.addEventListener('click', function() {
      document.getElementById('trendKeyword').value = this.getAttribute('data-tag');
      discoverTrends();
    });
  });
  
  document.getElementById('videoUpload').addEventListener('change', e => {
    const display = document.getElementById('fileNameDisplay');
    display.innerHTML = e.target.files[0] ? `<span style="color:var(--primary); font-weight:bold;">${e.target.files[0].name}</span>` : "영상을 선택하세요";
  });

  document.getElementById('trendResultsGrid').addEventListener('click', function(e) {
    if (e.target.closest('a')) return; 
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('download-btn')) {
      // 제목 넘겨줌!
      forceDownloadWithFallback(btn.getAttribute('data-url'), '틱톡', btn.getAttribute('data-title'));
    } else if (btn.classList.contains('analyze-btn')) {
      analyzeDirectTrendingVideo(btn.getAttribute('data-url'), btn.getAttribute('data-title'));
    }
  });
});

function switchTab(t) {
  document.getElementById('tab1Btn').className = t===1 ? "tab-btn active" : "tab-btn";
  document.getElementById('tab2Btn').className = t===2 ? "tab-btn active" : "tab-btn";
  document.getElementById('tab1Content').classList.toggle('hidden', t!==1);
  document.getElementById('tab2Content').classList.toggle('hidden', t!==2);
}

function toggleSettings() { document.getElementById('settingsModal').classList.toggle('hidden'); }
function saveSettings() {
  localStorage.setItem('myGeminiKey', document.getElementById('geminiKey').value.trim());
  localStorage.setItem('myPartnerLink', document.getElementById('partnerLink').value.trim());
  alert("설정 저장 완료! 💾"); toggleSettings();
}

// 💾 스마트 파일명 저장!
async function forceDownloadWithFallback(videoUrl, platformName, rawTitle = "") {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error("CORS 방어");
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    
    // 제목만 쏙 빼서 파일명 조립
    const safeTitle = rawTitle ? sanitizeFilename(decodeURIComponent(rawTitle)) : Date.now();
    a.download = `[${platformName}]_${safeTitle}.mp4`;
    
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    alert(`🎉 대박! [${platformName}]_${safeTitle}.mp4 다운로드 완료!`);
  } catch (error) {
    window.open(videoUrl, '_blank');
  }
}

async function runSmartDownload() {
  const linkInput = document.getElementById('videoLink').value.trim();
  if(!linkInput) return;
  const btn = document.getElementById('downloadBtn');
  btn.innerHTML = "<div class='spinner'></div>";
  try {
    const url = `https://www.tikwm.com/api/?url=${encodeURIComponent(linkInput)}`;
    const response = await fetch(url);
    const result = await response.json();
    if(result.data && result.data.play) await forceDownloadWithFallback(result.data.play, "틱톡", result.data.title);
  } catch (e) { alert("에러: " + e.message); }
  btn.innerHTML = "⬇️ 원본 MP4 저장하기";
}

function logStatus(msg, type = 'info') {
  const logs = document.getElementById('statusLogs');
  document.getElementById('engineStatusBox').classList.remove('hidden');
  const d = document.createElement('div');
  d.className = type === 'error' ? 'log-error' : (type === 'success' ? 'log-success' : '');
  d.innerText = msg;
  logs.appendChild(d);
  document.getElementById('engineStatusBox').scrollTop = 9999;
}

function getInstructionPrompt() {
  const p = localStorage.getItem('myPartnerLink') || "설정창 고유주소";
  return `너는 지금부터 한국어 숏폼 쇼츠 영상을 분석하는 최고의 카피라이터야. 영상의 소리와 자막을 보고 아래 형태로 대본을 써줘.
  💡 대본 정제 (리듬감 있는 3초 단위 줄바꿈)
  🎯 후킹 타이틀 3종
  💸 쇼핑 고정댓글 (주소: ${p})
  🛡️ 캡컷 필수 편집 가이드 3줄`;
}

async function runGeminiVideoTranslation() {
  const apiKey = localStorage.getItem('myGeminiKey');
  if(!apiKey) return alert("설정창에서 제미니 키를 입력하세요!");
  const fileInput = document.getElementById('videoUpload');
  if(!fileInput.files.length) return;
  const file = fileInput.files[0];

  document.getElementById('translateBtn').innerHTML = "<div class='spinner'></div>";
  document.getElementById('statusLogs').innerHTML = '';
  document.getElementById('resultBox').classList.add('hidden');

  const reader = new FileReader();
  reader.onload = async function() {
    const base64Video = reader.result.split(',')[1];
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: getInstructionPrompt() }, { inlineData: { mimeType: file.type, data: base64Video } }] }] })
      });
      const data = await res.json();
      document.getElementById('geminiOutput').innerText = data.candidates[0].content.parts[0].text;
      document.getElementById('resultBox').classList.remove('hidden');
    } catch(e) { logStatus(e.message, 'error'); }
    document.getElementById('translateBtn').innerHTML = "🪄 AI 한국어 대본 추출";
  };
  reader.readAsDataURL(file);
}

// 📥 100개 대량 수집 후 30개 필터링!
async function discoverTrends() {
  const kw = document.getElementById('trendKeyword').value.trim();
  if(!kw) return;
  const btn = document.getElementById('searchTrendBtn');
  btn.innerHTML = "<div class='spinner'></div>";
  document.getElementById('trendResultsGrid').innerHTML = "";
  
  try {
    const res = await fetch("https://www.tikwm.com/api/feed/search", {
      method: 'POST', body: new URLSearchParams({ keywords: kw, count: "100" })
    });
    const result = await res.json();
    let list = Array.isArray(result.data) ? result.data : (result.data && result.data.videos ? result.data.videos : []);
    if(!list.length) throw new Error("결과 없음");

    const tf = document.getElementById('trendTimeFilter').value;
    const sf = document.getElementById('trendSortFilter').value;
    const now = Math.floor(Date.now() / 1000);

    if(tf === "today") list = list.filter(v => v.create_time >= now - 86400);
    else if(tf === "week") list = list.filter(v => v.create_time >= now - 7*86400);
    else if(tf === "month") list = list.filter(v => v.create_time >= now - 30*86400);

    if(sf === "likes") list.sort((a,b) => b.digg_count - a.digg_count);
    else if(sf === "views") list.sort((a,b) => b.play_count - a.play_count);

    const finalData = list.slice(0, 30);
    document.getElementById('resultCount').innerText = `${finalData.length}개`;
    document.getElementById('trendResultsArea').classList.remove('hidden');

    finalData.forEach(v => {
      const likes = v.digg_count >= 10000 ? (v.digg_count/10000).toFixed(1)+"만" : v.digg_count;
      const views = v.play_count >= 10000 ? (v.play_count/10000).toFixed(1)+"만" : v.play_count;
      const encTitle = encodeURIComponent(v.title || "무제영상");
      const url = `https://www.tiktok.com/@${v.author.unique_id}/video/${v.video_id || v.id}`;
      
      const card = document.createElement('div');
      card.className = "video-card";
      card.innerHTML = `
        <a href="${url}" target="_blank" class="video-link-wrap">
          <div class="video-thumb"><img src="${v.cover}"><span>👀 ${views}</span></div>
          <div class="video-details">
            <div>
              <div class="author-line"><img src="${v.author.avatar}" style="width:12px;height:12px;border-radius:50%;"/><span>@${v.author.unique_id}</span></div>
              <p class="video-title">${v.title || "설명 없음"}</p>
            </div>
            <div class="stats-line"><span style="color:#f43f5e;">❤️ ${likes}</span><span>💬 ${v.comment_count}</span></div>
          </div>
        </a>
        <div class="card-actions">
          <button class="btn-sub-blue download-btn" data-url="${v.hdplay || v.play}" data-title="${encTitle}">⬇️ 제목저장</button>
          <button class="btn-sub-green analyze-btn" data-url="${v.play}" data-title="${encTitle}">🪄 AI 분석</button>
        </div>
      `;
      document.getElementById('trendResultsGrid').appendChild(card);
    });
  } catch(e) { alert(e.message); }
  btn.innerHTML = "발굴";
}

async function analyzeDirectTrendingVideo(url, encTitle) {
  const apiKey = localStorage.getItem('myGeminiKey');
  if(!apiKey) return;
  document.getElementById('statusLogs').innerHTML = '';
  document.getElementById('engineStatusBox').classList.remove('hidden');
  document.getElementById('resultBox').classList.add('hidden');
  logStatus("백그라운드 가동중...");
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const reader = new FileReader();
    reader.onload = async function() {
      try {
        const fetchRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({contents:[{parts:[{text:getInstructionPrompt()},{inlineData:{mimeType:blob.type, data:reader.result.split(',')[1]}}]}]})
        });
        const data = await fetchRes.json();
        document.getElementById('geminiOutput').innerText = data.candidates[0].content.parts[0].text;
        document.getElementById('resultBox').classList.remove('hidden');
        document.getElementById('resultBox').scrollIntoView({behavior:'smooth'});
      } catch(e) { logStatus(e.message, 'error'); }
    };
    reader.readAsDataURL(blob);
  } catch(e) { alert("CORS 차단됨. 다운로드 후 수동탭을 이용하세요!"); }
}