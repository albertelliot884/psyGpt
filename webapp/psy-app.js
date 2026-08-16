const DATA_BASE = '../data';
const STORAGE_KEY = 'psy-review-progress-v1';
const MANAGE_STORAGE_KEY = 'psy-manage-local-v1';

async function loadJson(name) {
  const res = await fetch(`${DATA_BASE}/${name}`);
  if (!res.ok) throw new Error(`Failed to load ${name}`);
  return res.json();
}

function getQueryParam(key) {
  return new URLSearchParams(location.search).get(key);
}

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { chapterStatus: {}, weakChapters: [], paperHistory: [], wrongQuestionIds: [] };
  } catch {
    return { chapterStatus: {}, weakChapters: [], paperHistory: [], wrongQuestionIds: [] };
  }
}

function writeProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function isWrongQuestion(progress, questionId) {
  return (progress.wrongQuestionIds || []).includes(questionId);
}

function toggleWrongQuestion(progress, questionId) {
  const set = new Set(progress.wrongQuestionIds || []);
  if (set.has(questionId)) set.delete(questionId);
  else set.add(questionId);
  progress.wrongQuestionIds = [...set];
  writeProgress(progress);
  return set.has(questionId);
}

function unique(arr) {
  return [...new Set(arr)];
}

function readManagedData() {
  try {
    return JSON.parse(localStorage.getItem(MANAGE_STORAGE_KEY)) || { questions: null, focusPoints: null, confusionPoints: null };
  } catch {
    return { questions: null, focusPoints: null, confusionPoints: null };
  }
}

function writeManagedData(data) {
  localStorage.setItem(MANAGE_STORAGE_KEY, JSON.stringify(data));
}

function pill(text, strong = false) {
  return `<span class="pill ${strong ? 'strong' : ''}">${text}</span>`;
}

async function bootstrap() {
  const page = document.body.dataset.page;
  const [subjects, chapters, focusPoints, confusionPoints, questions] = await Promise.all([
    loadJson('subjects.json'),
    loadJson('chapters.json'),
    loadJson('focus_points.json'),
    loadJson('confusion_points.json'),
    loadJson('questions.json')
  ]);

  const managed = readManagedData();
  const ctx = {
    subjects,
    chapters,
    focusPoints: managed.focusPoints || focusPoints,
    confusionPoints: managed.confusionPoints || confusionPoints,
    questions: managed.questions || questions,
    progress: readProgress()
  };

  if (page === 'home') renderHome(ctx);
  if (page === 'subject') renderSubject(ctx);
  if (page === 'chapter') renderChapter(ctx);
  if (page === 'papers') renderPapers(ctx);
  if (page === 'progress') renderProgress(ctx);
  if (page === 'manage') renderManage(ctx);
}

function renderHome({ subjects, chapters, questions, progress }) {
  const activeSubjects = subjects.filter(s => s.status !== 'archived');
  const doneCount = Object.values(progress.chapterStatus).filter(v => v === '已通读').length;
  const weakCount = unique(progress.weakChapters || []).length;
  const weakChapters = chapters.filter(ch => (progress.weakChapters || []).includes(ch.id));
  const nextRecommended = chapters.find(ch => !progress.chapterStatus[ch.id]) || chapters[0];

  document.getElementById('homeStats').innerHTML = [
    { label: '学科数量', value: activeSubjects.length },
    { label: '章节样板', value: chapters.length },
    { label: '题目样例', value: questions.length },
    { label: '已通读章节', value: doneCount },
    { label: '薄弱章节', value: weakCount },
    { label: '已生成试卷', value: (progress.paperHistory || []).length }
  ].map(item => `<div class="stat"><div class="eyebrow">${item.label}</div><h3>${item.value}</h3></div>`).join('');

  document.getElementById('subjectGrid').innerHTML = activeSubjects.map(subject => {
    const subjectChapters = chapters.filter(ch => ch.subjectId === subject.id);
    const planned = subject.status === 'planned';
    return `
      <article class="subject-card">
        <div class="eyebrow">${planned ? 'Planned' : 'Active'}</div>
        <h4>${subject.name}</h4>
        <p class="muted">${subject.description}</p>
        <div class="meta-row">
          ${pill(`章节 ${subjectChapters.length}`)}
          ${subject.tags.slice(0, 2).map(tag => pill(tag)).join('')}
        </div>
        <div class="cta-row">
          <a class="cta ${planned ? 'secondary' : 'primary'}" href="./psy-subject.html?subject=${subject.id}">${planned ? '查看结构' : '进入复习'}</a>
        </div>
      </article>
    `;
  }).join('');

  const recommendations = [
    `建议下一章优先推进：${nextRecommended.name}`,
    weakChapters[0] ? `当前最值得回看的薄弱章节：${weakChapters[0].name}` : '目前还没有薄弱标记，可以先从高频章节开始建立主干。',
    (progress.paperHistory || []).length ? '建议再做一套高频冲刺卷，把章节记忆转成题型反应。' : '建议先生成一套真题风格卷，感受当前卷面结构。'
  ];
  document.getElementById('recommendList').innerHTML = recommendations.map((text, idx) => `<div class="note-card"><h4>任务 ${idx + 1}</h4><p class="muted">${text}</p></div>`).join('');
}

function renderSubject({ subjects, chapters, focusPoints, confusionPoints, progress }) {
  const subjectId = getQueryParam('subject') || 'general_psychology';
  const subject = subjects.find(s => s.id === subjectId) || subjects[0];
  const subjectChapters = chapters.filter(ch => ch.subjectId === subject.id).sort((a, b) => a.order - b.order);
  const subjectFocus = focusPoints.filter(fp => fp.subjectId === subject.id);
  const subjectConfusions = confusionPoints.filter(cp => cp.subjectId === subject.id);
  const partDefinitions = subject.id === 'general_psychology' ? [
    { key: 'part_1', name: '第一编 绪论', orders: [1, 2] },
    { key: 'part_2', name: '第二编 人的信息加工', orders: [3, 4, 5, 6, 7, 8] },
    { key: 'part_3', name: '第三编 行为调节与控制', orders: [9, 10] },
    { key: 'part_4', name: '第四编 人的心理特性', orders: [11, 12] },
    { key: 'part_5', name: '第五编 学习与发展', orders: [13, 14] }
  ] : [];

  function renderChapterItem(ch) {
    const status = progress.chapterStatus[ch.id] || '未开始';
    const isWeak = (progress.weakChapters || []).includes(ch.id);
    return `
      <article class="chapter-item">
        <div class="chapter-item-head">
          <div style="display:flex; gap:12px;">
            <div class="chapter-order">${String(ch.order).padStart(2, '0')}</div>
            <div>
              <h4>${ch.name}</h4>
              <p class="muted">${ch.summary}</p>
            </div>
          </div>
          <div class="tag-row">
            ${pill(status, status !== '未开始')}
            ${isWeak ? pill('薄弱', true) : ''}
          </div>
        </div>
        <div class="meta-row">${ch.tags.map(tag => pill(tag)).join('')}</div>
        <div class="cta-row">
          <a class="cta primary" href="./psy-chapter.html?chapter=${ch.id}">进入本章</a>
        </div>
      </article>
    `;
  }

  document.getElementById('subjectTitle').textContent = subject.name;
  document.getElementById('subjectDesc').textContent = subject.description;
  document.getElementById('subjectMeta').innerHTML = `
    <div class="note-card"><h4>当前状态</h4><p class="muted">${subject.status === 'active' ? '首批样板学科，已接入章节与题目骨架。' : '已规划，后续按相同模板扩展。'}</p></div>
    <div class="note-card"><h4>章节数量</h4><p class="muted">当前已接入 ${subjectChapters.length} 个章节。${partDefinitions.length ? '其中普通心理学已按教材“编 → 章”结构分组展示。' : ''}</p></div>
    <div class="note-card"><h4>复习建议</h4><p class="muted">优先完成高频章节，并同步补题与易混点。</p></div>
  `;

  if (partDefinitions.length) {
    document.getElementById('chapterList').innerHTML = partDefinitions.map(part => {
      const partChapters = subjectChapters.filter(ch => part.orders.includes(ch.order));
      return `
        <section class="part-group">
          <div class="part-group-head">
            <div>
              <div class="eyebrow">Part</div>
              <h4>${part.name}</h4>
              <p class="muted">共 ${partChapters.length} 章，按教材原有复习顺序组织。</p>
            </div>
            <div class="tag-row">
              ${pill(`章节 ${partChapters.length}`, true)}
            </div>
          </div>
          <div class="chapter-list part-chapter-list">
            ${partChapters.map(renderChapterItem).join('')}
          </div>
        </section>
      `;
    }).join('');
  } else {
    document.getElementById('chapterList').innerHTML = subjectChapters.length ? subjectChapters.map(renderChapterItem).join('') : '<div class="empty">当前学科还没有接入章节内容。</div>';
  }

  document.getElementById('focusList').innerHTML = subjectFocus.length ? subjectFocus.slice(0, 6).map(item => `
    <div class="note-card">
      <h4>${item.title}</h4>
      <p class="muted">${item.summary}</p>
      <div class="meta-row">${item.keywords.map(word => pill(word)).join('')}</div>
    </div>
  `).join('') : '<div class="empty">暂无重点数据。</div>';

  document.getElementById('confusionList').innerHTML = subjectConfusions.length ? subjectConfusions.slice(0, 6).map(item => `
    <div class="note-card">
      <h4>${item.title}</h4>
      <p class="muted">${item.summary}</p>
    </div>
  `).join('') : '<div class="empty">暂无易混点数据。</div>';
}

function renderChapter({ subjects, chapters, focusPoints, confusionPoints, questions, progress }) {
  const chapterId = getQueryParam('chapter') || 'gp_memory';
  const chapter = chapters.find(ch => ch.id === chapterId) || chapters[0];
  const subject = subjects.find(item => item.id === chapter.subjectId);
  const chapterFocus = focusPoints.filter(fp => fp.chapterId === chapter.id);
  const chapterConfusions = confusionPoints.filter(cp => cp.chapterId === chapter.id);
  const chapterQuestions = questions.filter(q => q.chapterId === chapter.id);
  const objectiveTypes = ['选择题', '判断题'];
  const subjectiveTypes = ['名词解释', '简答题', '论述题', '辨析题'];
  const objectiveQuestions = chapterQuestions.filter(q => objectiveTypes.includes(q.type));
  const subjectiveQuestions = chapterQuestions.filter(q => subjectiveTypes.includes(q.type));
  const generalPsychologyParts = [
    { name: '第一编 绪论', orders: [1, 2] },
    { name: '第二编 人的信息加工', orders: [3, 4, 5, 6, 7, 8] },
    { name: '第三编 行为调节与控制', orders: [9, 10] },
    { name: '第四编 人的心理特性', orders: [11, 12] },
    { name: '第五编 学习与发展', orders: [13, 14] }
  ];
  const currentPart = chapter.subjectId === 'general_psychology'
    ? generalPsychologyParts.find(part => part.orders.includes(chapter.order))
    : null;

  function getQuestionRelations(item) {
    const relatedFocus = (item.relatedFocusPointIds || [])
      .map(id => chapterFocus.find(fp => fp.id === id))
      .filter(Boolean);
    const relatedConfusions = (item.relatedConfusionPointIds || [])
      .map(id => chapterConfusions.find(cp => cp.id === id))
      .filter(Boolean);
    return { relatedFocus, relatedConfusions };
  }

  function renderQuestionCard(item) {
    const { relatedFocus, relatedConfusions } = getQuestionRelations(item);
    return `
      <div class="question-card">
        <div class="meta-row">${pill(item.type, true)}${item.isHighFrequency ? pill('高频') : ''}${pill(item.difficulty)}${item.recommendedWords ? pill(`建议字数 ${item.recommendedWords}`) : ''}${item.recommendedTime ? pill(`建议用时 ${item.recommendedTime}`) : ''}${isWrongQuestion(progress, item.id) ? pill('错题', true) : ''}</div>
        <h4>${item.title}</h4>
        <p>${item.stem}</p>
        ${Array.isArray(item.options) ? `<ul class="bullet-list">${item.options.map(op => `<li>${op}</li>`).join('')}</ul>` : ''}
        ${(relatedFocus.length || relatedConfusions.length) ? `
          <div class="relation-block">
            ${relatedFocus.length ? `<div class="relation-group"><div class="relation-title">关联重点</div><div class="meta-row">${relatedFocus.map(fp => pill(fp.title)).join('')}</div></div>` : ''}
            ${relatedConfusions.length ? `<div class="relation-group"><div class="relation-title">关联易混点</div><div class="meta-row">${relatedConfusions.map(cp => pill(cp.title)).join('')}</div></div>` : ''}
          </div>
        ` : ''}
        <div class="cta-row">
          <button class="cta secondary wrong-toggle-btn" data-question-id="${item.id}">${isWrongQuestion(progress, item.id) ? '移出错题本' : '加入错题本'}</button>
        </div>
        <details>
          <summary>查看参考答案与得分点</summary>
          <div class="answer-block">
            <p class="answer-text">${item.answer}</p>
            <ul class="bullet-list">${(item.scoringPoints || []).map(point => `<li>${point}</li>`).join('')}</ul>
            ${item.analysis ? `<div class="answer-analysis muted">解析：${item.analysis}</div>` : ''}
          </div>
        </details>
      </div>
    `;
  }

  document.getElementById('chapterTitle').textContent = chapter.name;
  document.getElementById('chapterSummary').textContent = chapter.summary;
  document.getElementById('chapterBreadcrumb').innerHTML = [
    subject ? `<span class="breadcrumb-item">${subject.name}</span>` : '',
    currentPart ? `<span class="breadcrumb-sep">/</span><span class="breadcrumb-item strong">${currentPart.name}</span>` : ''
  ].join('');
  document.getElementById('chapterPosition').textContent = chapter.summary;
  document.getElementById('chapterTags').innerHTML = [
    pill(`重要度 ${chapter.importance}` , true),
    pill(`难度 ${chapter.difficulty}`),
    ...chapter.tags.map(tag => pill(tag))
  ].join('');

  document.getElementById('chapterStats').innerHTML = [
    { label: '重点', value: chapterFocus.length },
    { label: '易混点', value: chapterConfusions.length },
    { label: '客观题', value: objectiveQuestions.length },
    { label: '主观题', value: subjectiveQuestions.length }
  ].map(item => `<div class="stat"><div class="eyebrow">${item.label}</div><h3>${item.value}</h3></div>`).join('');

  document.getElementById('chapterFocus').innerHTML = chapterFocus.length ? chapterFocus.map(item => `
    <div class="note-card">
      <h4>${item.title}</h4>
      <p class="muted">${item.summary}</p>
      <div class="meta-row">${(item.questionTypes || []).map(type => pill(type)).join('')}</div>
      <p class="muted">建议：优先把这类内容和本章主观题一起看，建立“重点—题型”对应关系。</p>
    </div>
  `).join('') : '<div class="empty">当前章节还没有重点数据。</div>';

  document.getElementById('chapterConfusions').innerHTML = chapterConfusions.length ? chapterConfusions.map(item => `
    <div class="note-card">
      <h4>${item.title}</h4>
      <p class="muted">${item.summary}</p>
      <ul class="bullet-list">${(item.differencePoints || []).slice(0, 3).map(point => `<li>${point}</li>`).join('')}</ul>
      <p class="muted">建议：先看差异点，再练本章辨析题和概念题。</p>
    </div>
  `).join('') : '<div class="empty">当前章节还没有易混点数据。</div>';

  document.getElementById('chapterObjectiveQuestions').innerHTML = objectiveQuestions.length ? objectiveQuestions.map(renderQuestionCard).join('') : '<div class="empty">当前章节还没有客观题。</div>';
  document.getElementById('chapterSubjectiveQuestions').innerHTML = subjectiveQuestions.length ? subjectiveQuestions.map(renderQuestionCard).join('') : '<div class="empty">当前章节还没有主观题。</div>';

  document.querySelectorAll('.wrong-toggle-btn').forEach(btn => {
    btn.onclick = () => {
      const added = toggleWrongQuestion(progress, btn.dataset.questionId);
      alert(added ? '已加入错题本' : '已移出错题本');
      renderChapter({ subjects, chapters, focusPoints, confusionPoints, questions, progress });
    };
  });

  document.getElementById('markReviewedBtn').onclick = () => {
    progress.chapterStatus[chapter.id] = '已通读';
    writeProgress(progress);
    alert('已标记为“已通读”');
  };
  document.getElementById('markWeakBtn').onclick = () => {
    progress.weakChapters = unique([...(progress.weakChapters || []), chapter.id]);
    writeProgress(progress);
    alert('已标记为“薄弱”');
  };
}

function renderPapers({ subjects, questions, chapters, focusPoints, confusionPoints, progress }) {
  const subjectSelect = document.getElementById('paperSubject');
  const chapterSelect = document.getElementById('paperChapter');
  const difficultySelect = document.getElementById('paperDifficulty');
  const modeSelect = document.getElementById('paperMode');
  const countSelect = document.getElementById('paperCount');

  const objectiveTypes = ['选择题', '判断题'];
  const subjectiveTypes = ['名词解释', '简答题', '论述题', '辨析题'];

  subjectSelect.innerHTML = subjects.map(subject => `<option value="${subject.id}">${subject.name}</option>`).join('');

  function refreshChapterOptions() {
    const subjectId = subjectSelect.value;
    const relatedChapters = chapters.filter(ch => ch.subjectId === subjectId).sort((a, b) => a.order - b.order);
    chapterSelect.innerHTML = [`<option value="all">全部章节</option>`, ...relatedChapters.map(ch => `<option value="${ch.id}">${ch.name}</option>`)].join('');
  }

  function pickByPreference(pool, count, preferredTypes = []) {
    const picked = [];
    const used = new Set();
    preferredTypes.forEach(type => {
      const found = pool.find(q => q.type === type && !used.has(q.id));
      if (found && picked.length < count) {
        picked.push(found);
        used.add(found.id);
      }
    });
    pool.forEach(q => {
      if (picked.length < count && !used.has(q.id)) {
        picked.push(q);
        used.add(q.id);
      }
    });
    return picked;
  }

  subjectSelect.onchange = refreshChapterOptions;
  refreshChapterOptions();

  document.getElementById('generatePaperBtn').onclick = () => {
    const type = document.getElementById('paperType').value;
    const subjectId = subjectSelect.value;
    const chapterId = chapterSelect.value;
    const difficulty = difficultySelect.value;
    const mode = modeSelect.value;
    const count = Number(countSelect.value || 6);

    let filtered = questions.filter(q => q.subjectId === subjectId);
    if (chapterId !== 'all') filtered = filtered.filter(q => q.chapterId === chapterId);
    if (difficulty !== 'all') filtered = filtered.filter(q => q.difficulty === difficulty);
    if (mode === 'objective') filtered = filtered.filter(q => objectiveTypes.includes(q.type));
    if (mode === 'subjective') filtered = filtered.filter(q => subjectiveTypes.includes(q.type));

    let pool = filtered;
    let picked = [];
    if (type === 'chapter') {
      picked = pickByPreference(pool, count, ['选择题', '判断题', '名词解释', '简答题', '辨析题', '论述题']);
    } else if (type === 'high') {
      pool = filtered.filter(q => q.isHighFrequency);
      picked = pickByPreference(pool.length ? pool : filtered, count, ['选择题', '简答题', '辨析题', '论述题']);
    } else {
      picked = pickByPreference(pool, count, ['选择题', '判断题', '名词解释', '简答题', '辨析题', '论述题']);
    }

    progress.paperHistory = [{ type, subjectId, chapterId, difficulty, mode, createdAt: new Date().toISOString(), questionIds: picked.map(p => p.id) }, ...(progress.paperHistory || [])].slice(0, 10);
    writeProgress(progress);

    if (!picked.length) {
      document.getElementById('paperResult').innerHTML = '<div class="empty">当前筛选条件下没有可用题目，可以放宽章节、难度或题型模式。</div>';
      return;
    }

    const sectionMap = {
      '选择题': [],
      '判断题': [],
      '名词解释': [],
      '简答题': [],
      '辨析题': [],
      '论述题': [],
      '其他题型': []
    };
    picked.forEach(q => {
      if (sectionMap[q.type]) sectionMap[q.type].push(q);
      else sectionMap['其他题型'].push(q);
    });

    const typeLabel = type === 'chapter' ? '章节卷' : type === 'high' ? '高频冲刺卷' : '真题风格卷';
    const subjectName = (subjects.find(s => s.id === subjectId) || {}).name || '未知学科';
    const chapterName = chapterId === 'all' ? '全部章节' : ((chapters.find(ch => ch.id === chapterId) || {}).name || '指定章节');
    const modeLabel = mode === 'mixed' ? '混合组卷' : mode === 'objective' ? '客观题模式' : '主观题模式';
    const difficultyLabel = difficulty === 'all' ? '全部难度' : difficulty === 'easy' ? '基础' : difficulty === 'medium' ? '中等' : '提升';
    const sections = Object.entries(sectionMap)
      .filter(([, arr]) => arr.length)
      .map(([label, arr]) => `
        <section class="paper-section">
          <div class="paper-section-title">${label}</div>
          ${arr.map((q, idx) => {
            const relatedFocus = (q.relatedFocusPointIds || []).map(id => focusPoints.find(fp => fp.id === id)).filter(Boolean);
            const relatedConfusions = (q.relatedConfusionPointIds || []).map(id => confusionPoints.find(cp => cp.id === id)).filter(Boolean);
            return `
            <div class="question-card">
              <div class="meta-row">${pill(q.type, true)}${q.isHighFrequency ? pill('高频') : ''}${pill(q.difficulty)}${isWrongQuestion(progress, q.id) ? pill('错题', true) : ''}</div>
              <h4>${q.title}</h4>
              <p>${idx + 1}. ${q.stem}</p>
              ${Array.isArray(q.options) ? `<ul class="bullet-list">${q.options.map(op => `<li>${op}</li>`).join('')}</ul>` : ''}
              ${(relatedFocus.length || relatedConfusions.length) ? `
                <div class="relation-block">
                  ${relatedFocus.length ? `<div class="relation-group"><div class="relation-title">关联重点</div><div class="meta-row">${relatedFocus.map(fp => pill(fp.title)).join('')}</div></div>` : ''}
                  ${relatedConfusions.length ? `<div class="relation-group"><div class="relation-title">关联易混点</div><div class="meta-row">${relatedConfusions.map(cp => pill(cp.title)).join('')}</div></div>` : ''}
                </div>
              ` : ''}
              <div class="cta-row">
                <button class="cta secondary paper-wrong-toggle-btn" data-question-id="${q.id}">${isWrongQuestion(progress, q.id) ? '移出错题本' : '加入错题本'}</button>
              </div>
              <details>
                <summary>查看参考答案</summary>
                <div class="answer-block">
                  <div class="meta-row">${q.recommendedWords ? pill(`建议字数 ${q.recommendedWords}`) : ''}${q.recommendedTime ? pill(`建议用时 ${q.recommendedTime}`) : ''}</div>
                  <p class="answer-text">${q.answer}</p>
                  <ul class="bullet-list">${(q.scoringPoints || []).map(point => `<li>${point}</li>`).join('')}</ul>
                  ${q.analysis ? `<div class="answer-analysis muted">解析：${q.analysis}</div>` : ''}
                </div>
              </details>
            </div>
          `;}).join('')}
        </section>
      `).join('');

    document.getElementById('paperResult').innerHTML = `
      <div class="paper-preview">
        <div class="paper-head">
          <div class="eyebrow">Generated Paper</div>
          <h3>${subjectName}${typeLabel}</h3>
          <p class="muted">当前版本支持章节、题型模式、难度与题量联合筛选，适合快速生成一套可刷的混合训练卷。</p>
          <div class="paper-meta">
            ${pill(typeLabel, true)}
            ${pill(`题目 ${picked.length}`)}
            ${pill(`章节 ${chapterName}`)}
            ${pill(modeLabel)}
            ${pill(difficultyLabel)}
          </div>
        </div>
        ${sections}
      </div>
    `;

    document.querySelectorAll('.paper-wrong-toggle-btn').forEach(btn => {
      btn.onclick = () => {
        const added = toggleWrongQuestion(progress, btn.dataset.questionId);
        alert(added ? '已加入错题本' : '已移出错题本');
        document.getElementById('generatePaperBtn').click();
      };
    });
  };
}

function renderManage({ subjects, chapters, questions, focusPoints, confusionPoints }) {
  const manageType = document.getElementById('manageType');
  const manageSubject = document.getElementById('manageSubject');
  const manageChapter = document.getElementById('manageChapter');
  const manageKeyword = document.getElementById('manageKeyword');
  const manageForm = document.getElementById('manageForm');
  const manageList = document.getElementById('manageList');
  const manageEditorTitle = document.getElementById('manageEditorTitle');
  let store = readManagedData();
  let localQuestions = store.questions || [...questions];
  let localFocusPoints = store.focusPoints || [...focusPoints];
  let localConfusionPoints = store.confusionPoints || [...confusionPoints];
  let editingId = null;

  const questionFields = [
    ['id', 'ID（可留空自动生成）'], ['subjectId', '学科ID'], ['chapterId', '章节ID'], ['type', '题型'], ['title', '标题'], ['stem', '题干'],
    ['difficulty', '难度'], ['importance', '重要度'], ['answer', '参考答案'], ['analysis', '解析'], ['scoringPoints', '得分点（每行一条）'], ['options', '选项（每行一条，可空）'], ['tags', '标签（逗号分隔）'],
    ['recommendedWords', '建议字数'], ['recommendedTime', '建议用时']
  ];
  const focusFields = [
    ['id', 'ID（可留空自动生成）'], ['subjectId', '学科ID'], ['chapterId', '章节ID'], ['title', '标题'], ['focusType', '重点类型'], ['summary', '摘要'],
    ['importance', '重要度'], ['questionTypes', '对应题型（逗号分隔）'], ['keywords', '关键词（逗号分隔）']
  ];
  const confusionFields = [
    ['id', 'ID（可留空自动生成）'], ['subjectId', '学科ID'], ['chapterId', '章节ID'], ['title', '标题'], ['summary', '摘要'],
    ['differencePoints', '关键差异（每行一条）'], ['commonMistakes', '常见误区（每行一条）'], ['questionTypes', '对应题型（逗号分隔）'], ['importance', '重要度']
  ];

  function currentType() {
    return manageType.value;
  }

  function currentData() {
    if (currentType() === 'questions') return localQuestions;
    if (currentType() === 'focus') return localFocusPoints;
    return localConfusionPoints;
  }

  function persist() {
    store = { questions: localQuestions, focusPoints: localFocusPoints, confusionPoints: localConfusionPoints };
    writeManagedData(store);
  }

  function renderForm(item = null) {
    const fields = currentType() === 'questions' ? questionFields : (currentType() === 'focus' ? focusFields : confusionFields);
    const questionTypeOptions = ['名词解释', '简答题', '辨析题', '论述题', '选择题', '判断题'];
    const difficultyOptions = ['easy', 'medium', 'hard'];
    const importanceOptions = ['low', 'medium', 'high'];
    const focusTypeOptions = ['high_frequency', 'must_memorize', 'framework', 'application'];
    const modeLabel = currentType() === 'questions' ? '题目' : (currentType() === 'focus' ? '重点' : '易混点');
    const currentChapterId = item?.chapterId || document.getElementById('manage_chapterId')?.value || manageChapter.value;
    const relatedFocusOptions = localFocusPoints
      .filter(fp => !currentChapterId || currentChapterId === 'all' || fp.chapterId === currentChapterId)
      .map(fp => `<label class="checkbox-row"><input type="checkbox" class="manage-related-focus" value="${fp.id}" ${(item?.relatedFocusPointIds || []).includes(fp.id) ? 'checked' : ''} /> <span>${fp.title}</span></label>`)
      .join('');
    const relatedConfusionOptions = localConfusionPoints
      .filter(cp => !currentChapterId || currentChapterId === 'all' || cp.chapterId === currentChapterId)
      .map(cp => `<label class="checkbox-row"><input type="checkbox" class="manage-related-confusion" value="${cp.id}" ${(item?.relatedConfusionPointIds || []).includes(cp.id) ? 'checked' : ''} /> <span>${cp.title}</span></label>`)
      .join('');
    manageEditorTitle.textContent = `${item ? '编辑' : '新增'}${modeLabel}`;
    const extraQuestionControls = currentType() === 'questions' ? `
      <label>
        <span>高频题</span>
        <input type="checkbox" id="manage_isHighFrequency" ${item?.isHighFrequency ? 'checked' : ''} />
      </label>
      <label>
        <span>真题风格</span>
        <input type="checkbox" id="manage_isPastExamStyle" ${item?.isPastExamStyle ? 'checked' : ''} />
      </label>
      <label style="grid-column: 1 / -1;">
        <span>关联重点</span>
        <div class="stack">${relatedFocusOptions || '<div class="muted">当前章节暂无可选重点。</div>'}</div>
      </label>
      <label style="grid-column: 1 / -1;">
        <span>关联易混点</span>
        <div class="stack">${relatedConfusionOptions || '<div class="muted">当前章节暂无可选易混点。</div>'}</div>
      </label>
    ` : '';
    manageForm.innerHTML = fields.map(([key, label]) => {
      const value = Array.isArray(item?.[key])
        ? (['scoringPoints','options','differencePoints','commonMistakes'].includes(key) ? item[key].join('\n') : item[key].join(', '))
        : (item?.[key] || '');
      const useTextarea = ['stem','answer','analysis','summary','scoringPoints','options','differencePoints','commonMistakes'].includes(key);
      if (key === 'subjectId') {
        return `
        <label>
          <span>${label}</span>
          <select id="manage_${key}">${subjects.map(subject => `<option value="${subject.id}" ${value === subject.id ? 'selected' : ''}>${subject.name}</option>`).join('')}</select>
        </label>
        `;
      }
      if (key === 'chapterId') {
        const selectedSubjectId = (item?.subjectId || document.getElementById('manage_subjectId')?.value || subjects[0]?.id || '');
        const chapterOptions = chapters.filter(ch => ch.subjectId === selectedSubjectId).sort((a, b) => a.order - b.order);
        return `
        <label>
          <span>${label}</span>
          <select id="manage_${key}">${chapterOptions.map(ch => `<option value="${ch.id}" ${value === ch.id ? 'selected' : ''}>${ch.name}</option>`).join('')}</select>
        </label>
        `;
      }
      if (key === 'type' && currentType() === 'questions') {
        return `
        <label>
          <span>${label}</span>
          <select id="manage_${key}">${questionTypeOptions.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('')}</select>
        </label>
        `;
      }
      if (key === 'difficulty' && currentType() === 'questions') {
        return `
        <label>
          <span>${label}</span>
          <select id="manage_${key}">${difficultyOptions.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('')}</select>
        </label>
        `;
      }
      if (key === 'importance') {
        return `
        <label>
          <span>${label}</span>
          <select id="manage_${key}">${importanceOptions.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('')}</select>
        </label>
        `;
      }
      if (key === 'focusType' && currentType() === 'focus') {
        return `
        <label>
          <span>${label}</span>
          <select id="manage_${key}">${focusTypeOptions.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('')}</select>
        </label>
        `;
      }
      return `
      <label>
        <span>${label}</span>
        ${useTextarea ? `<textarea id="manage_${key}" rows="4">${value}</textarea>` : `<input type="text" id="manage_${key}" value="${value}" />`}
      </label>
    `;
    }).join('') + extraQuestionControls;
  }

  function refreshChapterOptions() {
    const subjectId = manageSubject.value;
    const related = chapters.filter(ch => subjectId === 'all' || ch.subjectId === subjectId).sort((a, b) => a.order - b.order);
    manageChapter.innerHTML = ['<option value="all">全部章节</option>', ...related.map(ch => `<option value="${ch.id}">${ch.name}</option>`)].join('');
  }

  function renderList() {
    const keyword = (manageKeyword.value || '').trim();
    const chapterId = manageChapter.value;
    const subjectId = manageSubject.value;
    const list = currentData().filter(item => {
      if (subjectId !== 'all' && item.subjectId !== subjectId) return false;
      if (chapterId !== 'all' && item.chapterId !== chapterId) return false;
      if (keyword) return JSON.stringify(item).includes(keyword);
      return true;
    });

    manageList.innerHTML = list.length ? list.map(item => `
      <div class="note-card">
        <h4>${item.title || item.id}</h4>
        <p class="muted">${item.stem || item.summary || ''}</p>
        <div class="meta-row">
          ${pill(item.chapterId || '无章节')}
          ${item.type ? pill(item.type, true) : ''}
          ${item.focusType ? pill(item.focusType, true) : ''}
        </div>
        <div class="cta-row">
          <button class="cta secondary manage-edit-btn" data-id="${item.id}">编辑</button>
          <button class="cta secondary manage-delete-btn" data-id="${item.id}">删除</button>
        </div>
      </div>
    `).join('') : '<div class="empty">当前筛选条件下没有数据。</div>';

    document.querySelectorAll('.manage-edit-btn').forEach(btn => {
      btn.onclick = () => {
        editingId = btn.dataset.id;
        renderForm(currentData().find(x => x.id === btn.dataset.id));
        bindManageFormDependencies();
      };
    });

    document.querySelectorAll('.manage-delete-btn').forEach(btn => {
      btn.onclick = () => {
        const targetItem = currentData().find(x => x.id === btn.dataset.id);
        const ok = confirm(`确认删除“${targetItem?.title || btn.dataset.id}”吗？此操作会影响本地管理数据。`);
        if (!ok) return;
        if (currentType() === 'questions') localQuestions = localQuestions.filter(x => x.id !== btn.dataset.id);
        else if (currentType() === 'focus') localFocusPoints = localFocusPoints.filter(x => x.id !== btn.dataset.id);
        else localConfusionPoints = localConfusionPoints.filter(x => x.id !== btn.dataset.id);
        persist();
        if (editingId === btn.dataset.id) {
          editingId = null;
          renderForm();
          bindManageFormDependencies();
        }
        renderList();
      };
    });
  }

  manageSubject.innerHTML = ['<option value="all">全部学科</option>', ...subjects.map(s => `<option value="${s.id}">${s.name}</option>`)].join('');
  refreshChapterOptions();

  function bindManageFormDependencies() {
    const subjectNode = document.getElementById('manage_subjectId');
    if (subjectNode) {
      subjectNode.onchange = () => {
        const selectedSubjectId = subjectNode.value;
        const chapterNode = document.getElementById('manage_chapterId');
        if (chapterNode) {
          const chapterOptions = chapters.filter(ch => ch.subjectId === selectedSubjectId).sort((a, b) => a.order - b.order);
          chapterNode.innerHTML = chapterOptions.map(ch => `<option value="${ch.id}">${ch.name}</option>`).join('');
        }
        renderForm({
          ...(currentType() === 'questions' ? {
            isHighFrequency: document.getElementById('manage_isHighFrequency')?.checked,
            isPastExamStyle: document.getElementById('manage_isPastExamStyle')?.checked,
            relatedFocusPointIds: [...document.querySelectorAll('.manage-related-focus:checked')].map(node => node.value),
            relatedConfusionPointIds: [...document.querySelectorAll('.manage-related-confusion:checked')].map(node => node.value)
          } : {}),
          ...Object.fromEntries((currentType() === 'questions' ? questionFields : (currentType() === 'focus' ? focusFields : confusionFields)).map(([key]) => {
            const node = document.getElementById(`manage_${key}`);
            if (!node) return [key, ''];
            if (['scoringPoints','options','differencePoints','commonMistakes'].includes(key)) return [key, node.value ? node.value.split('\n').map(v => v.trim()).filter(Boolean) : []];
            if (['tags','keywords','questionTypes'].includes(key)) return [key, node.value ? node.value.split('，').join(',').split(',').map(v => v.trim()).filter(Boolean) : []];
            return [key, node.value];
          }))
        });
        bindManageFormDependencies();
      };
    }
  }

  renderForm();
  bindManageFormDependencies();
  renderList();

  manageType.onchange = () => {
    editingId = null;
    renderForm();
    bindManageFormDependencies();
    renderList();
  };
  manageSubject.onchange = () => {
    refreshChapterOptions();
    renderList();
  };
  manageChapter.onchange = renderList;
  manageKeyword.oninput = renderList;

  function generateLocalId(type, subjectId, chapterId, existingList) {
    const prefix = type === 'questions' ? 'q' : (type === 'focus' ? 'fp' : 'cp');
    const chapterPart = chapterId || 'local';
    let seq = 1;
    let candidate = `${prefix}_${chapterPart}_local_${String(seq).padStart(3, '0')}`;
    const ids = new Set(existingList.map(item => item.id));
    while (ids.has(candidate)) {
      seq += 1;
      candidate = `${prefix}_${chapterPart}_local_${String(seq).padStart(3, '0')}`;
    }
    return candidate;
  }

  document.getElementById('saveManageBtn').onclick = (e) => {
    e.preventDefault();
    const fields = currentType() === 'questions' ? questionFields : (currentType() === 'focus' ? focusFields : confusionFields);
    const item = {};
    fields.forEach(([key]) => {
      const node = document.getElementById(`manage_${key}`);
      const value = node.value.trim();
      if (['tags','keywords','questionTypes'].includes(key)) item[key] = value ? value.split('，').join(',').split(',').map(v => v.trim()).filter(Boolean) : [];
      else if (['scoringPoints','options','differencePoints','commonMistakes'].includes(key)) item[key] = value ? value.split('\n').map(v => v.trim()).filter(Boolean) : [];
      else item[key] = value;
    });
    item.status = 'active';
    const target = currentType() === 'questions' ? localQuestions : (currentType() === 'focus' ? localFocusPoints : localConfusionPoints);
    if (!item.id) item.id = generateLocalId(currentType(), item.subjectId, item.chapterId, target);
    const idx = target.findIndex(x => x.id === (editingId || item.id));
    const existing = idx >= 0 ? target[idx] : null;
    if (currentType() === 'questions') {
      item.isPastExamStyle = document.getElementById('manage_isPastExamStyle').checked;
      item.isHighFrequency = document.getElementById('manage_isHighFrequency').checked;
      item.sourceType = existing?.sourceType || '手动录入';
      item.sourceDetail = existing?.sourceDetail || '内容管理页';
      item.scoringPoints = item.scoringPoints?.length ? item.scoringPoints : (existing?.scoringPoints || []);
      item.relatedFocusPointIds = [...document.querySelectorAll('.manage-related-focus:checked')].map(node => node.value);
      item.relatedConfusionPointIds = [...document.querySelectorAll('.manage-related-confusion:checked')].map(node => node.value);
      item.options = item.options?.length ? item.options : (existing?.options || []);
      item.answerLevel = existing?.answerLevel || item.answerLevel || '';
    }
    if (idx >= 0) target[idx] = { ...target[idx], ...item };
    else target.unshift(item);
    editingId = item.id;
    persist();
    renderList();
    renderForm(target.find(x => x.id === item.id));
    bindManageFormDependencies();
    alert('已保存到本地内容库');
  };

  document.getElementById('clearManageBtn').onclick = (e) => {
    e.preventDefault();
    editingId = null;
    renderForm();
    bindManageFormDependencies();
  };

  document.getElementById('exportDataBtn').onclick = () => {
    const blob = new Blob([JSON.stringify({ questions: localQuestions, focusPoints: localFocusPoints, confusionPoints: localConfusionPoints }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'psy-manage-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  document.getElementById('importDataInput').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.questions)) localQuestions = parsed.questions;
    if (Array.isArray(parsed.focusPoints)) localFocusPoints = parsed.focusPoints;
    if (Array.isArray(parsed.confusionPoints)) localConfusionPoints = parsed.confusionPoints;
    persist();
    renderForm();
    bindManageFormDependencies();
    renderList();
    alert('已导入本地数据');
  };

  document.getElementById('resetManageDataBtn').onclick = () => {
    localStorage.removeItem(MANAGE_STORAGE_KEY);
    alert('已重置为默认数据，请刷新页面');
  };
}

function renderProgress({ chapters, questions, subjects, progress }) {
  const statuses = progress.chapterStatus || {};
  const paperHistory = progress.paperHistory || [];
  const reviewedCount = Object.values(statuses).filter(v => v === '已通读').length;
  const weakIds = unique(progress.weakChapters || []);
  const weakChapters = chapters.filter(ch => weakIds.includes(ch.id));
  const untouched = chapters.filter(ch => !statuses[ch.id]);
  const objectiveTypes = ['选择题', '判断题'];
  const subjectiveTypes = ['名词解释', '简答题', '论述题', '辨析题'];
  const wrongQuestionIds = unique(progress.wrongQuestionIds || []);
  const wrongQuestions = questions.filter(q => wrongQuestionIds.includes(q.id));
  const wrongChapterIds = unique(wrongQuestions.map(q => q.chapterId));

  document.getElementById('progressStats').innerHTML = [
    { label: '已通读章节', value: reviewedCount },
    { label: '薄弱章节', value: weakIds.length },
    { label: '累计组卷', value: paperHistory.length },
    { label: '未开始章节', value: untouched.length },
    { label: '错题数量', value: wrongQuestionIds.length }
  ].map(item => `<div class="stat"><div class="eyebrow">${item.label}</div><h3>${item.value}</h3></div>`).join('');

  document.getElementById('progressChapterList').innerHTML = `
    <div class="dashboard-card">
      <h4>章节状态面板</h4>
      <div class="progress-list">
        ${chapters.map(ch => {
          const qCount = questions.filter(q => q.chapterId === ch.id).length;
          return `
            <div class="progress-row">
              <div class="progress-main">
                <strong>${ch.name}</strong>
                <span class="muted">${ch.summary}</span>
              </div>
              <div class="meta-row">
                ${pill(`题量 ${qCount}`)}
                ${pill(statuses[ch.id] || '未开始', (statuses[ch.id] || '未开始') !== '未开始')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  const weaknessCards = [];
  if (weakChapters.length) {
    weaknessCards.push(...weakChapters.map(ch => `
      <div class="note-card">
        <h4>${ch.name}</h4>
        <p class="muted">建议优先回看本章重点与易混点，再做一套章节卷。</p>
        <div class="cta-row"><a class="quick-link" href="./psy-chapter.html?chapter=${ch.id}">进入本章</a></div>
      </div>
    `));
  }
  if (untouched.length) {
    weaknessCards.push(`
      <div class="note-card">
        <h4>下一步建议</h4>
        <p class="muted">当前还有 ${untouched.length} 个章节未开始，建议从 ${untouched[0].name} 继续推进。</p>
      </div>
    `);
  }
  if (paperHistory.length) {
    const lastPaper = paperHistory[0];
    weaknessCards.push(`
      <div class="note-card">
        <h4>最近训练</h4>
        <p class="muted">最近生成了一套${lastPaper.type === 'chapter' ? '章节卷' : lastPaper.type === 'high' ? '高频冲刺卷' : '真题风格卷'}，可以结合薄弱章节继续做第二轮回看。</p>
      </div>
    `);
  }
  document.getElementById('weaknessList').innerHTML = weaknessCards.length ? weaknessCards.join('') : '<div class="empty">目前还没有薄弱标记，可以先从“记忆”章节开始做第一轮复习。</div>';

  document.getElementById('paperHistoryList').innerHTML = paperHistory.length ? paperHistory.map(item => {
    const subjectName = (subjects.find(s => s.id === item.subjectId) || {}).name || '未知学科';
    const chapterName = !item.chapterId || item.chapterId === 'all' ? '全部章节' : ((chapters.find(ch => ch.id === item.chapterId) || {}).name || '指定章节');
    const typeLabel = item.type === 'chapter' ? '章节卷' : item.type === 'high' ? '高频冲刺卷' : '真题风格卷';
    const modeLabel = item.mode === 'objective' ? '客观题模式' : item.mode === 'subjective' ? '主观题模式' : '混合组卷';
    const difficultyLabel = !item.difficulty || item.difficulty === 'all' ? '全部难度' : item.difficulty === 'easy' ? '基础' : item.difficulty === 'medium' ? '中等' : '提升';
    return `
      <div class="note-card">
        <h4>${subjectName}${typeLabel}</h4>
        <p class="muted">章节范围：${chapterName}</p>
        <div class="meta-row">
          ${pill(modeLabel)}
          ${pill(difficultyLabel)}
          ${pill(`题目 ${item.questionIds.length}`)}
        </div>
      </div>
    `;
  }).join('') : '<div class="empty">你还没有组过卷，可以先去测试卷中心生成一套混合卷。</div>';

  document.getElementById('coverageList').innerHTML = chapters.map(ch => {
    const chapterQuestions = questions.filter(q => q.chapterId === ch.id);
    const objectiveCount = chapterQuestions.filter(q => objectiveTypes.includes(q.type)).length;
    const subjectiveCount = chapterQuestions.filter(q => subjectiveTypes.includes(q.type)).length;
    const typesCovered = unique(chapterQuestions.map(q => q.type)).length;
    return `
      <div class="note-card">
        <h4>${ch.name}</h4>
        <div class="meta-row">
          ${pill(`总题量 ${chapterQuestions.length}`, true)}
          ${pill(`客观题 ${objectiveCount}`)}
          ${pill(`主观题 ${subjectiveCount}`)}
          ${pill(`题型 ${typesCovered}`)}
        </div>
        <p class="muted">${objectiveCount === 0 ? '当前还缺客观题。' : subjectiveCount === 0 ? '当前还缺主观题。' : '当前章节已具备客观题与主观题双层覆盖。'} </p>
      </div>
    `;
  }).join('');

  document.getElementById('wrongQuestionSummary').innerHTML = wrongQuestions.length ? `
    <div class="note-card">
      <h4>当前错题本状态</h4>
      <div class="meta-row">
        ${pill(`错题 ${wrongQuestions.length}`, true)}
        ${pill(`涉及章节 ${wrongChapterIds.length}`)}
        ${pill(`主观题 ${wrongQuestions.filter(q => subjectiveTypes.includes(q.type)).length}`)}
        ${pill(`客观题 ${wrongQuestions.filter(q => objectiveTypes.includes(q.type)).length}`)}
      </div>
      <p class="muted">建议优先按章节回看错题，再结合本章重点与易混点做二轮复习。</p>
    </div>
  ` : '<div class="empty">当前还没有加入错题本的题目，可以在章节页或试卷页手动标记。</div>';

  document.getElementById('wrongQuestionList').innerHTML = wrongQuestions.length ? wrongQuestions.map(q => {
    const chapter = chapters.find(ch => ch.id === q.chapterId);
    return `
      <div class="note-card wrong-card">
        <h4>${q.title}</h4>
        <p class="muted">${q.stem}</p>
        <div class="meta-row">
          ${pill(q.type, true)}
          ${pill(chapter ? chapter.name : '未知章节')}
          ${q.recommendedWords ? pill(`建议字数 ${q.recommendedWords}`) : ''}
          ${q.recommendedTime ? pill(`建议用时 ${q.recommendedTime}`) : ''}
        </div>
        <div class="answer-analysis muted">建议先回到原章节复习相关重点与易混点，再回来重做这道题。</div>
        <div class="cta-row">
          <a class="quick-link" href="./psy-chapter.html?chapter=${q.chapterId}">回到本章</a>
          <button class="cta secondary progress-wrong-toggle-btn" data-question-id="${q.id}">移出错题本</button>
        </div>
      </div>
    `;
  }).join('') : '<div class="empty">错题本还是空的，后面做题时可以把卡住的题随手加入。</div>';

  document.querySelectorAll('.progress-wrong-toggle-btn').forEach(btn => {
    btn.onclick = () => {
      toggleWrongQuestion(progress, btn.dataset.questionId);
      renderProgress({ chapters, questions, subjects, progress });
    };
  });
}

bootstrap().catch(err => {
  console.error(err);
  document.body.innerHTML += `<div class="shell"><div class="card empty">页面加载失败：${err.message}</div></div>`;
});
