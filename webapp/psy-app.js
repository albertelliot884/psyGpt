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

function getChapterAnswers(progress) {
  return progress.chapterAnswers || {};
}

function getChapterAnswer(progress, questionId) {
  return getChapterAnswers(progress)[questionId] || '';
}

function setChapterAnswer(progress, questionId, value) {
  progress.chapterAnswers = {
    ...getChapterAnswers(progress),
    [questionId]: value
  };
  writeProgress(progress);
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

const PAPER_SESSION_KEY = 'psy-paper-session-v1';

function readPaperSession() {
  try {
    return JSON.parse(localStorage.getItem(PAPER_SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

function writePaperSession(session) {
  localStorage.setItem(PAPER_SESSION_KEY, JSON.stringify(session));
}

function clearPaperSession() {
  localStorage.removeItem(PAPER_SESSION_KEY);
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
    <div class="note-card"><h4>当前状态</h4><p class="muted">${subject.id === 'experimental_psychology' ? '第二批最小样板学科，已接入 4 章与基础训练题组，可用于章节复习与基础试卷训练。' : subject.id === 'general_psychology' ? '首批成熟样板学科，已完成章节重排、题型补齐与本地试卷训练闭环。' : subject.status === 'active' ? '已接入章节、复习内容与基础题组，可用于学科浏览、章节复习和本地内容管理。' : '已规划，后续按相同模板扩展。'}</p></div>
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

  const focusListNode = document.getElementById('focusList');
  const confusionListNode = document.getElementById('confusionList');

  if (focusListNode) {
    focusListNode.innerHTML = subjectFocus.length ? subjectFocus.slice(0, 6).map(item => `
      <div class="note-card">
        <h4>${item.title}</h4>
        <p class="muted">${item.content || item.summary || ''}</p>
        <div class="meta-row">${(item.keywords || item.tags || []).map(word => pill(word)).join('')}</div>
      </div>
    `).join('') : '<div class="empty">暂无重点数据。</div>';
  }

  if (confusionListNode) {
    confusionListNode.innerHTML = subjectConfusions.length ? subjectConfusions.slice(0, 6).map(item => `
      <div class="note-card">
        <h4>${item.title}</h4>
        <p class="muted">${item.content || item.summary || ''}</p>
      </div>
    `).join('') : '<div class="empty">暂无易混点数据。</div>';
  }
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

  function getStructuredScoringPoints(item) {
    const points = item.scoringPoints || [];
    if (!points.length) return { core: [], extra: [] };
    if (item.scoringPointGroups && (item.scoringPointGroups.core || item.scoringPointGroups.extra)) {
      return {
        core: item.scoringPointGroups.core || [],
        extra: item.scoringPointGroups.extra || []
      };
    }
    if (points.length === 1) return { core: points, extra: [] };
    const coreCount = Math.max(1, Math.ceil(points.length * 0.6));
    return {
      core: points.slice(0, coreCount),
      extra: points.slice(coreCount)
    };
  }

  function renderQuestionCard(item) {
    const { relatedFocus, relatedConfusions } = getQuestionRelations(item);
    const isSubjective = subjectiveTypes.includes(item.type);
    const structuredPoints = getStructuredScoringPoints(item);
    return `
      <div class="question-card">
        <div class="meta-row">${pill(item.type, true)}${item.isHighFrequency ? pill('高频') : ''}${pill(item.difficulty)}${item.recommendedWords ? pill(`建议字数 ${item.recommendedWords}`) : ''}${item.recommendedTime ? pill(`建议用时 ${item.recommendedTime}`) : ''}${isWrongQuestion(progress, item.id) ? pill('错题', true) : ''}</div>
        <h4>${item.title}</h4>
        <p>${item.stem}</p>
        ${item.type === '选择题' ? `<div class="stack">${(item.options || []).map((op, idx) => {
          const value = String.fromCharCode(65 + idx);
          return `<label class="checkbox-row"><input type="radio" name="chapter_answer_${item.id}" value="${value}" ${getChapterAnswer(progress, item.id) === value ? 'checked' : ''} /> <span>${op}</span></label>`;
        }).join('')}</div>` : Array.isArray(item.options) ? `<ul class="bullet-list">${item.options.map(op => `<li>${op}</li>`).join('')}</ul>` : ''}
        ${item.type === '判断题' ? `<div class="stack">
          <label class="checkbox-row"><input type="radio" name="chapter_answer_${item.id}" value="正确" ${getChapterAnswer(progress, item.id) === '正确' ? 'checked' : ''} /> <span>正确</span></label>
          <label class="checkbox-row"><input type="radio" name="chapter_answer_${item.id}" value="错误" ${getChapterAnswer(progress, item.id) === '错误' ? 'checked' : ''} /> <span>错误</span></label>
        </div>` : ''}
        ${(relatedFocus.length || relatedConfusions.length) ? `
          <div class="relation-block">
            ${relatedFocus.length ? `<div class="relation-group"><div class="relation-title">关联重点</div><div class="meta-row">${relatedFocus.map(fp => pill(fp.title)).join('')}</div></div>` : ''}
            ${relatedConfusions.length ? `<div class="relation-group"><div class="relation-title">关联易混点</div><div class="meta-row">${relatedConfusions.map(cp => pill(cp.title)).join('')}</div></div>` : ''}
          </div>
        ` : ''}
        ${isSubjective ? `
          <div class="panel">
            <div class="eyebrow">作答区</div>
            <textarea class="paper-answer-input chapter-answer-input" data-question-id="${item.id}" rows="7" placeholder="${item.recommendedWords ? `建议按 ${item.recommendedWords} 组织答案，先写必写点，再补充拓展点。` : '请先写出主干答案，再补充可展开内容。'}">${getChapterAnswer(progress, item.id)}</textarea>
          </div>
        ` : ''}
        <div class="cta-row">
          <button class="cta secondary wrong-toggle-btn" data-question-id="${item.id}">${isWrongQuestion(progress, item.id) ? '移出错题本' : '加入错题本'}</button>
        </div>
        <details>
          <summary>查看参考答案与得分点</summary>
          <div class="answer-block">
            <p class="answer-text">${item.answer}</p>
            ${structuredPoints.core.length ? `
              <div class="relation-group">
                <div class="relation-title" style="color: #b42318;">必写点</div>
                <ul class="bullet-list">${structuredPoints.core.map(point => `<li><span style="color:#b42318;font-weight:700;">【必写】</span> ${point}</li>`).join('')}</ul>
              </div>
            ` : ''}
            ${structuredPoints.extra.length ? `
              <div class="relation-group">
                <div class="relation-title" style="color: #1d4ed8;">可补充点</div>
                <ul class="bullet-list">${structuredPoints.extra.map(point => `<li><span style="color:#1d4ed8;font-weight:700;">【补充】</span> ${point}</li>`).join('')}</ul>
              </div>
            ` : ''}
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
    <div class="note-card focus-note-card">
      <div class="meta-row">${pill('重点', true)}${pill(`重要度 ${item.importance || 'medium'}`)}${(item.questionTypes || []).map(type => pill(type)).join('')}</div>
      <h4>${item.title}</h4>
      <div class="focus-summary">${item.summary}</div>
      <p class="muted">建议：优先把这类内容和本章主观题一起看，建立“重点—题型”对应关系。</p>
    </div>
  `).join('') : '<div class="empty">当前章节还没有重点数据。</div>';

  document.getElementById('chapterConfusions').innerHTML = chapterConfusions.length ? chapterConfusions.map(item => `
    <div class="note-card confusion-note-card">
      <div class="meta-row">${pill('易混点', true)}${pill(`重要度 ${item.importance || 'medium'}`)}${(item.questionTypes || []).map(type => pill(type)).join('')}</div>
      <h4>${item.title}</h4>
      <div class="focus-summary">${item.summary}</div>
      <div class="relation-group">
        <div class="relation-title">关键差异</div>
        <ul class="bullet-list">${(item.differencePoints || []).map(point => `<li>${point}</li>`).join('')}</ul>
      </div>
      ${(item.commonMistakes || []).length ? `<div class="relation-group"><div class="relation-title">常见误区</div><ul class="bullet-list">${item.commonMistakes.map(point => `<li>${point}</li>`).join('')}</ul></div>` : ''}
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

  document.querySelectorAll('.chapter-answer-input').forEach(node => {
    node.addEventListener('input', () => {
      setChapterAnswer(progress, node.dataset.questionId, node.value);
    });
  });

  document.querySelectorAll('input[type="radio"][name^="chapter_answer_"]').forEach(node => {
    node.addEventListener('change', () => {
      setChapterAnswer(progress, node.name.replace('chapter_answer_', ''), node.value);
    });
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
  const templateSelect = document.getElementById('paperTemplate');
  const paperResult = document.getElementById('paperResult');
  const paperHistoryActions = document.getElementById('paperHistoryActions');
  let latestPaper = null;
  let currentPaperSession = readPaperSession();

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

  function pickByStructure(pool, structure) {
    const picked = [];
    const used = new Set();
    Object.entries(structure).forEach(([type, count]) => {
      const sameType = pool.filter(q => q.type === type && !used.has(q.id));
      sameType.slice(0, count).forEach(q => {
        picked.push(q);
        used.add(q.id);
      });
    });
    return picked;
  }

  function getTemplateStructure(template, count) {
    if (template === 'exam') {
      return {
        '选择题': 4,
        '判断题': 2,
        '名词解释': 2,
        '简答题': 2,
        '辨析题': 1,
        '论述题': 1
      };
    }
    return {
      '选择题': Math.max(1, Math.floor(count / 4)),
      '判断题': Math.max(1, Math.floor(count / 6)),
      '名词解释': Math.max(1, Math.floor(count / 6)),
      '简答题': Math.max(1, Math.floor(count / 4)),
      '辨析题': Math.max(1, Math.floor(count / 8)),
      '论述题': Math.max(1, Math.floor(count / 8))
    };
  }

  function createPaperSession(picked, meta, config) {
    return {
      id: `paper_${Date.now()}`,
      questionIds: picked.map(item => item.id),
      answers: {},
      submitted: false,
      createdAt: new Date().toISOString(),
      submittedAt: null,
      meta,
      config
    };
  }

  function buildMetaFromHistory(item) {
    return {
      typeLabel: item.type === 'chapter' ? '章节卷' : item.type === 'high' ? '高频冲刺卷' : '真题风格卷',
      subjectName: (subjects.find(s => s.id === item.subjectId) || {}).name || '未知学科',
      chapterName: !item.chapterId || item.chapterId === 'all' ? '全部章节' : ((chapters.find(ch => ch.id === item.chapterId) || {}).name || '指定章节'),
      modeLabel: item.mode === 'mixed' ? '混合组卷' : item.mode === 'objective' ? '客观题模式' : '主观题模式',
      difficultyLabel: !item.difficulty || item.difficulty === 'all' ? '全部难度' : item.difficulty === 'easy' ? '基础' : item.difficulty === 'medium' ? '中等' : '提升',
      templateLabel: item.template === 'exam' ? '考试题量卷' : item.template === 'custom' ? '自定义题量' : '快速训练卷'
    };
  }

  function getPaperTrackKey(item) {
    return [item.type, item.subjectId, item.chapterId || 'all', item.mode || 'mixed', item.template || 'quick', item.difficulty || 'all'].join('::');
  }

  function getPreviousSubmittedPaper(item) {
    const history = progress.paperHistory || [];
    const key = getPaperTrackKey(item);
    return history.find(historyItem => historyItem !== item && historyItem.submittedAt && getPaperTrackKey(historyItem) === key);
  }

  function getPaperTrendSummary(item, chapters = []) {
    if (!item) return '';
    const objectiveText = item.improvementComparedToPrevious === 'improved'
      ? '客观题较上次更稳'
      : item.improvementComparedToPrevious === 'declined'
        ? '客观题较上次回落'
        : item.improvementComparedToPrevious === 'flat'
          ? '客观题与上次基本持平'
          : '这是该训练轨迹的首次有效交卷';
    const subjectiveText = item.subjectiveTrendComparedToPrevious === 'subjective_improved'
      ? '主观题主干覆盖有所提升'
      : item.subjectiveTrendComparedToPrevious === 'subjective_declined'
        ? '主观题主干覆盖有所回落'
        : item.subjectiveTrendComparedToPrevious === 'subjective_flat'
          ? '主观题主干覆盖与上次接近'
          : '主观题暂缺可比历史';
    const weakChapterName = ((chapters || []).find(ch => (item.newWeakChapterIds || []).includes(ch.id)) || {}).name;
    if (item.improvementComparedToPrevious === 'declined' && item.subjectiveTrendComparedToPrevious === 'subjective_declined') {
      return `${objectiveText}，${subjectiveText}，建议优先回看${weakChapterName ? `「${weakChapterName}」` : '当前薄弱章节'}后再做同轨迹试卷。`;
    }
    if (item.improvementComparedToPrevious === 'flat' && item.subjectiveTrendComparedToPrevious === 'subjective_improved') {
      return `${objectiveText}，但${subjectiveText}，说明答案框架在变完整，可以继续巩固客观题准确率。`;
    }
    if (item.improvementComparedToPrevious === 'improved' && item.subjectiveTrendComparedToPrevious === 'subjective_declined') {
      return `${objectiveText}，但${subjectiveText}，说明客观题状态在提升，主观题仍要补主干框架。`;
    }
    if (item.improvementComparedToPrevious === 'improved') {
      return `${objectiveText}，${subjectiveText}，建议继续保持当前训练节奏。`;
    }
    return `${objectiveText}，${subjectiveText}。`;
  }

  function restorePaperFromHistory(item) {
    const restored = (item.questionIds || []).map(id => questions.find(q => q.id === id)).filter(Boolean);
    if (!restored.length) {
      paperResult.innerHTML = '<div class="empty">这套历史试卷关联的题目当前不可用，可能已被本地内容管理数据覆盖。</div>';
      return;
    }
    const meta = buildMetaFromHistory(item);
    currentPaperSession = {
      id: `paper_${Date.now()}`,
      questionIds: restored.map(item => item.id),
      answers: { ...(item.answerSnapshot || {}) },
      submitted: !!item.submittedAt,
      createdAt: item.createdAt || new Date().toISOString(),
      submittedAt: item.submittedAt || null,
      meta,
      config: {
        type: item.type,
        subjectId: item.subjectId,
        chapterId: item.chapterId,
        difficulty: item.difficulty,
        mode: item.mode,
        template: item.template,
        count: item.questionIds.length,
        restoredFromHistory: true,
        restoredAnswerSnapshot: !!item.answerSnapshot,
        historicalAnswerSnapshot: { ...(item.answerSnapshot || {}) },
        compareWithHistory: false
      }
    };
    writePaperSession(currentPaperSession);
    latestPaper = { picked: restored, meta };
    renderPaper(restored, meta);
  }

  function regenerateWrongOnlyPaper(item) {
    const wrongSet = new Set(item.newWrongQuestionIds || []);
    const picked = (item.questionIds || []).map(id => questions.find(q => q.id === id)).filter(q => q && wrongSet.has(q.id));
    if (!picked.length) {
      alert('这套历史试卷还没有可用于再练的新增错题。');
      return;
    }
    const historicalAnswerSnapshot = Object.fromEntries(Object.entries(item.answerSnapshot || {}).filter(([questionId]) => wrongSet.has(questionId)));
    const meta = {
      ...buildMetaFromHistory(item),
      typeLabel: '历史错题再练卷'
    };
    currentPaperSession = createPaperSession(picked, meta, {
      type: item.type,
      subjectId: item.subjectId,
      chapterId: item.chapterId,
      difficulty: item.difficulty,
      mode: item.mode,
      template: item.template,
      count: picked.length,
      regeneratedFromWrong: true,
      restoredFromHistory: true,
      compareWithHistory: true,
      historicalAnswerSnapshot
    });
    writePaperSession(currentPaperSession);
    latestPaper = { picked, meta };
    renderPaper(picked, meta);
  }

  function renderPaperHistoryActions() {
    if (!paperHistoryActions) return;
    const history = progress.paperHistory || [];
    paperHistoryActions.innerHTML = history.length ? history.slice(0, 5).map((item, idx) => {
      const meta = buildMetaFromHistory(item);
      return `
        <div class="note-card">
          <h4>${idx === 0 ? '最近一套' : `历史第 ${idx + 1} 套`} · ${meta.subjectName}${meta.typeLabel}</h4>
          <p class="muted">${item.answerSnapshot ? '可恢复当时这套卷的原作答内容，适合直接复盘。' : '当前只能恢复题目集合，尚未保存当时作答内容。'} </p>
          <div class="meta-row">
            ${pill(meta.chapterName)}
            ${pill(meta.modeLabel)}
            ${pill(`题目 ${item.questionIds.length}`)}
            ${pill(`第 ${item.attemptNumber || 1} 次`, !!item.attemptNumber)}
            ${item.submittedAt ? pill('已交卷', true) : pill('仅生成未交卷')}
            ${item.answerSnapshot ? pill('可恢复原作答') : ''}
            ${item.improvementComparedToPrevious === 'improved' ? pill('较上次进步', true) : item.improvementComparedToPrevious === 'declined' ? pill('较上次回落') : item.improvementComparedToPrevious === 'flat' ? pill('较上次持平') : ''}
            ${item.subjectiveTrendComparedToPrevious === 'subjective_improved' ? pill('主观题覆盖提升', true) : item.subjectiveTrendComparedToPrevious === 'subjective_declined' ? pill('主观题覆盖回落') : item.subjectiveTrendComparedToPrevious === 'subjective_flat' ? pill('主观题覆盖持平') : ''}
          </div>
          ${item.submittedAt ? `<div class="meta-row">${pill(`新增错题 ${(item.newWrongQuestionIds || []).length}`)}${pill(`新增薄弱章节 ${(item.newWeakChapterIds || []).length}`)}${item.answerSnapshot ? pill(`已保存作答 ${Object.keys(item.answerSnapshot || {}).length}`) : ''}</div>` : ''}
        ${item.submittedAt ? `<div class="training-result-note">${getPaperTrendSummary(item, chapters)}</div>` : ''}
          <div class="cta-row">
            <button class="cta secondary paper-history-restore-btn" data-history-index="${idx}">恢复这套卷</button>
            ${item.submittedAt ? `<button class="cta secondary paper-history-wrong-btn" data-history-index="${idx}">基于这套错题再练</button>` : ''}
          </div>
        </div>
      `;
    }).join('') : '<div class="empty">还没有历史试卷，先生成并交一套卷，后面就能在这里直接恢复。</div>';

    document.querySelectorAll('.paper-history-restore-btn').forEach(btn => {
      btn.onclick = () => {
        const item = (progress.paperHistory || [])[Number(btn.dataset.historyIndex)];
        if (item) restorePaperFromHistory(item);
      };
    });

    document.querySelectorAll('.paper-history-wrong-btn').forEach(btn => {
      btn.onclick = () => {
        const item = (progress.paperHistory || [])[Number(btn.dataset.historyIndex)];
        if (item) regenerateWrongOnlyPaper(item);
      };
    });
  }

  function getCurrentAnswer(questionId) {
    return currentPaperSession?.answers?.[questionId] || '';
  }

  function getHistoricalAnswer(questionId) {
    return currentPaperSession?.config?.historicalAnswerSnapshot?.[questionId] || '';
  }

  function updatePaperAnswer(questionId, value) {
    if (!currentPaperSession) return;
    currentPaperSession.answers = currentPaperSession.answers || {};
    currentPaperSession.answers[questionId] = value;
    writePaperSession(currentPaperSession);
  }

  function getStructuredScoringPoints(q) {
    const points = q.scoringPoints || [];
    if (!points.length) return { core: [], extra: [] };
    if (q.scoringPointGroups && (q.scoringPointGroups.core || q.scoringPointGroups.extra)) {
      return {
        core: q.scoringPointGroups.core || [],
        extra: q.scoringPointGroups.extra || []
      };
    }
    if (points.length === 1) return { core: points, extra: [] };
    const coreCount = Math.max(1, Math.ceil(points.length * 0.6));
    return {
      core: points.slice(0, coreCount),
      extra: points.slice(coreCount)
    };
  }

  function normalizeForCoverage(text) {
    return String(text || '').replace(/[，。；：、“”‘’（）()、,.;:\/\s]/g, '').toLowerCase();
  }

  function getCoverageKeywords(point) {
    const normalized = normalizeForCoverage(point);
    if (!normalized) return [];
    const parts = point.split(/[，。；：、,.;:（）()\s]/).map(item => normalizeForCoverage(item)).filter(Boolean);
    const keywords = parts.filter(item => item.length >= 2);
    return unique([normalized.slice(0, Math.min(8, normalized.length)), ...keywords]).filter(Boolean);
  }

  function evaluateAnswerCoverage(answer, points) {
    const normalizedAnswer = normalizeForCoverage(answer);
    return points.map(point => {
      const keywords = getCoverageKeywords(point);
      const matched = keywords.some(keyword => keyword && normalizedAnswer.includes(keyword));
      return { point, matched };
    });
  }

  function renderAnswerInput(q) {
    const answer = getCurrentAnswer(q.id);
    const disabled = currentPaperSession?.submitted ? 'disabled' : '';
    if (q.type === '选择题') {
      return `<div class="stack">${(q.options || []).map((op, idx) => {
        const value = String.fromCharCode(65 + idx);
        return `<label class="checkbox-row"><input type="radio" name="answer_${q.id}" value="${value}" ${answer === value ? 'checked' : ''} ${disabled} /> <span>${op}</span></label>`;
      }).join('')}</div>`;
    }
    if (q.type === '判断题') {
      return `<div class="stack">
        <label class="checkbox-row"><input type="radio" name="answer_${q.id}" value="正确" ${answer === '正确' ? 'checked' : ''} ${disabled} /> <span>正确</span></label>
        <label class="checkbox-row"><input type="radio" name="answer_${q.id}" value="错误" ${answer === '错误' ? 'checked' : ''} ${disabled} /> <span>错误</span></label>
      </div>`;
    }
    const placeholder = q.recommendedWords ? `建议按 ${q.recommendedWords} 组织答案` : '请输入你的答案';
    return `<textarea class="paper-answer-input" data-question-id="${q.id}" rows="6" placeholder="${placeholder}" ${disabled}>${answer}</textarea>`;
  }

  function getPaperPerformance(picked) {
    const answers = currentPaperSession?.answers || {};
    const answeredCount = picked.filter(q => {
      const answer = answers[q.id];
      return typeof answer === 'string' ? answer.trim() : !!answer;
    }).length;
    const unansweredCount = picked.length - answeredCount;
    const objectiveQuestions = picked.filter(q => objectiveTypes.includes(q.type));
    const objectiveCorrectCount = objectiveQuestions.filter(q => answers[q.id] && answers[q.id] === q.answer).length;
    const subjectiveCoverageStats = picked.filter(q => subjectiveTypes.includes(q.type)).reduce((acc, q) => {
      const structuredPoints = getStructuredScoringPoints(q);
      const currentAnswer = answers[q.id] || '';
      const historicalAnswer = getHistoricalAnswer(q.id);
      if (!structuredPoints.core.length || !historicalAnswer) return acc;
      const currentCoreCount = evaluateAnswerCoverage(currentAnswer, structuredPoints.core).filter(item => item.matched).length;
      const historicalCoreCount = evaluateAnswerCoverage(historicalAnswer, structuredPoints.core).filter(item => item.matched).length;
      acc.comparedCount += 1;
      if (currentCoreCount > historicalCoreCount) acc.improvedCount += 1;
      else if (currentCoreCount < historicalCoreCount) acc.declinedCount += 1;
      else acc.flatCount += 1;
      return acc;
    }, { comparedCount: 0, improvedCount: 0, declinedCount: 0, flatCount: 0 });
    return {
      answeredCount,
      unansweredCount,
      objectiveTotal: objectiveQuestions.length,
      objectiveCorrectCount,
      subjectiveCoverageStats
    };
  }

  function renderPaperSummary(picked) {
    if (!currentPaperSession) return '';
    const performance = getPaperPerformance(picked);
    const historyMode = currentPaperSession?.config?.restoredFromHistory;
    const compareMode = currentPaperSession?.config?.compareWithHistory;
    return `
      <div class="paper-session-summary training-result-card ${currentPaperSession.submitted ? 'submitted' : ''}">
        <div class="paper-session-stat">总题数：<strong>${picked.length}</strong></div>
        <div class="paper-session-stat">已作答：<strong>${performance.answeredCount}</strong></div>
        <div class="paper-session-stat">未作答：<strong>${performance.unansweredCount}</strong></div>
        <div class="paper-session-stat">状态：<strong>${currentPaperSession.submitted ? '已交卷' : '作答中'}</strong></div>
        ${currentPaperSession.submitted ? `<div class="paper-session-stat">客观题答对：<strong>${performance.objectiveCorrectCount}/${performance.objectiveTotal}</strong></div>` : ''}
        ${historyMode ? `<div class="paper-session-stat">视图：<strong>${compareMode ? '历史对照重做' : '历史作答恢复'}</strong></div>` : ''}
        ${currentPaperSession.submitted ? '<div class="paper-session-note">已进入复盘模式：客观题答错会自动沉淀到错题本，主观题可手动标记“本题没答好”，系统会同步把相关章节记入薄弱章节。</div>' : '<div class="paper-session-note">当前试卷作答内容会自动保存在本地，可中断后继续完成。</div>'}
      </div>
    `;
  }

  function renderPaperReviewAdvice(picked) {
    if (!currentPaperSession?.submitted) return '';
    const wrongIds = new Set(progress.wrongQuestionIds || []);
    const weakIds = new Set(progress.weakChapters || []);
    const paperWrongCount = picked.filter(q => wrongIds.has(q.id)).length;
    const paperWeakChapters = unique(picked.map(q => q.chapterId).filter(id => weakIds.has(id)));
    const topWeakChapter = chapters.find(ch => ch.id === paperWeakChapters[0]);
    const nextPaperSuggestion = topWeakChapter
      ? `建议下一轮优先回看「${topWeakChapter.name}」，然后再做一套同章节“高频冲刺卷”。`
      : '建议下一轮继续做一套“高频冲刺卷”，把当前卷暴露出的记忆漏洞压实。';
    return `
      <div class="paper-advice-block">
        <div class="paper-advice-head">
          <div>
            <div class="eyebrow">Review Advice</div>
            <h4>本卷复盘建议</h4>
          </div>
        </div>
        <div class="paper-advice-grid">
          <div class="paper-advice-card">
            <div class="relation-title">本卷新增错题沉淀</div>
            <div class="paper-advice-value">${paperWrongCount} 题</div>
            <div class="muted">建议优先回看答错或未作答的客观题，并二次口述主观题框架。</div>
          </div>
          <div class="paper-advice-card">
            <div class="relation-title">本卷命中的薄弱章节</div>
            <div class="paper-advice-value">${paperWeakChapters.length ? paperWeakChapters.length + ' 章' : '暂无新增'}</div>
            <div class="muted">${topWeakChapter ? `优先复盘：${topWeakChapter.name}` : '当前卷面表现较均衡，可继续保持整卷训练。'} </div>
          </div>
          <div class="paper-advice-card">
            <div class="relation-title">下一步建议</div>
            <div class="muted">${nextPaperSuggestion}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderPaperNavigator(picked) {
    if (!currentPaperSession) return '';
    return `
      <div class="paper-nav-block">
        <div class="paper-nav-head">
          <div>
            <div class="eyebrow">Navigator</div>
            <h4>题号导航</h4>
          </div>
          <div class="meta-row">
            ${pill('已答', true)}
            ${pill('未答')}
            ${currentPaperSession.submitted ? `${pill('答对', true)}${pill('待订正')}` : ''}
          </div>
        </div>
        <div class="paper-nav-grid">
          ${picked.map((q, idx) => {
            const answer = (currentPaperSession.answers || {})[q.id] || '';
            const answered = typeof answer === 'string' ? answer.trim() : !!answer;
            const objectiveCorrect = currentPaperSession.submitted && objectiveTypes.includes(q.type)
              ? answer && answer === q.answer
              : null;
            const navClass = objectiveCorrect === true
              ? 'correct'
              : objectiveCorrect === false
                ? 'wrong'
                : answered
                  ? 'answered'
                  : 'empty';
            return `<button class="paper-nav-item ${navClass}" data-target-question-id="${q.id}">${idx + 1}</button>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderPaper(picked, meta) {
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

    const sections = Object.entries(sectionMap)
      .filter(([, arr]) => arr.length)
      .map(([label, arr]) => `
        <section class="paper-section">
          <div class="paper-section-title">${label}</div>
          ${arr.map((q, idx) => {
            const relatedFocus = (q.relatedFocusPointIds || []).map(id => focusPoints.find(fp => fp.id === id)).filter(Boolean);
            const relatedConfusions = (q.relatedConfusionPointIds || []).map(id => confusionPoints.find(cp => cp.id === id)).filter(Boolean);
            const structuredPoints = getStructuredScoringPoints(q);
            const currentAnswer = getCurrentAnswer(q.id);
            const historicalAnswer = getHistoricalAnswer(q.id);
            const coreCoverage = evaluateAnswerCoverage(currentAnswer, structuredPoints.core);
            const extraCoverage = evaluateAnswerCoverage(currentAnswer, structuredPoints.extra);
            const historicalCoreCoverage = evaluateAnswerCoverage(historicalAnswer, structuredPoints.core);
            const historicalExtraCoverage = evaluateAnswerCoverage(historicalAnswer, structuredPoints.extra);
            const answered = typeof currentAnswer === 'string' ? currentAnswer.trim() : !!currentAnswer;
            const objectiveCorrect = currentPaperSession?.submitted && objectiveTypes.includes(q.type)
              ? currentAnswer && currentAnswer === q.answer
              : null;
            return `
            <div class="question-card ${currentPaperSession?.submitted ? 'paper-reviewed-card' : ''}" id="paper-question-${q.id}">
              <div class="meta-row">${pill(q.type, true)}${q.isHighFrequency ? pill('高频') : ''}${pill(q.difficulty)}${pill(answered ? '已作答' : '未作答', answered)}${currentPaperSession?.submitted ? pill('已交卷', true) : ''}${objectiveCorrect === true ? pill('客观题答对', true) : ''}${objectiveCorrect === false ? pill('客观题待订正') : ''}${isWrongQuestion(progress, q.id) ? pill('错题', true) : ''}</div>
              <h4>${q.title}</h4>
              <p>${idx + 1}. ${q.stem}</p>
              ${(relatedFocus.length || relatedConfusions.length) ? `
                <div class="relation-block">
                  ${relatedFocus.length ? `<div class="relation-group"><div class="relation-title">关联重点</div><div class="meta-row">${relatedFocus.map(fp => pill(fp.title)).join('')}</div></div>` : ''}
                  ${relatedConfusions.length ? `<div class="relation-group"><div class="relation-title">关联易混点</div><div class="meta-row">${relatedConfusions.map(cp => pill(cp.title)).join('')}</div></div>` : ''}
                </div>
              ` : ''}
              <div class="panel">
                <div class="eyebrow">答题区</div>
                ${renderAnswerInput(q)}
              </div>
              <div class="cta-row">
                <button class="cta secondary paper-wrong-toggle-btn" data-question-id="${q.id}">${isWrongQuestion(progress, q.id) ? '移出错题本' : '加入错题本'}</button>
              </div>
              <details ${currentPaperSession?.submitted ? 'open' : ''}>
                <summary>${currentPaperSession?.submitted ? '查看复盘结果' : '查看参考答案'}</summary>
                <div class="answer-block">
                  <div class="meta-row">${q.recommendedWords ? pill(`建议字数 ${q.recommendedWords}`) : ''}${q.recommendedTime ? pill(`建议用时 ${q.recommendedTime}`) : ''}</div>
                  ${currentPaperSession?.submitted ? `
                    <div class="paper-review-grid">
                      <div class="paper-review-block">
                        <div class="relation-title">你的作答</div>
                        <div class="answer-analysis ${answered ? '' : 'muted'}">${answered ? currentAnswer : '本题尚未作答'}</div>
                      </div>
                      ${currentPaperSession?.config?.compareWithHistory ? `
                        <div class="paper-review-block history-answer-block">
                          <div class="relation-title">上次作答</div>
                          <div class="answer-analysis ${historicalAnswer ? '' : 'muted'}">${historicalAnswer || '上次未保存本题作答'}</div>
                        </div>
                      ` : ''}
                    </div>
                    ${objectiveTypes.includes(q.type) ? `
                      ${currentPaperSession?.config?.compareWithHistory ? `
                        <div class="paper-review-block history-compare-block">
                          <div class="relation-title">前后对照</div>
                          <div class="meta-row">${pill(`上次：${historicalAnswer || '未作答'}`)}${pill(`本次：${currentAnswer || '未作答'}`, !!currentAnswer)}${historicalAnswer && currentAnswer && historicalAnswer !== currentAnswer ? pill('答案已变化', true) : ''}</div>
                        </div>
                      ` : ''}
                      <div class="paper-review-block">
                        <div class="relation-title">客观题核对</div>
                        <div class="meta-row">${pill(`你的答案：${currentAnswer || '未作答'}`, !!currentAnswer)}${pill(`正确答案：${q.answer}`, true)}${objectiveCorrect === true ? pill('结果：答对', true) : pill('结果：待订正')}</div>
                      </div>
                    ` : `
                      <div class="paper-review-grid">
                        <div class="paper-review-block">
                          <div class="relation-title">必写点</div>
                          ${structuredPoints.core.length ? `<ul class="bullet-list coverage-list">${coreCoverage.map(item => `<li class="coverage-item ${item.matched ? 'matched' : 'missing'}"><span class="coverage-icon">${item.matched ? '✅' : '▫️'}</span><span>${item.point}</span></li>`).join('')}</ul>` : '<div class="muted">暂无必写点标注。</div>'}
                        </div>
                        <div class="paper-review-block">
                          <div class="relation-title">可补充点</div>
                          ${structuredPoints.extra.length ? `<ul class="bullet-list coverage-list">${extraCoverage.map(item => `<li class="coverage-item ${item.matched ? 'matched' : 'missing'}"><span class="coverage-icon">${item.matched ? '✅' : '▫️'}</span><span>${item.point}</span></li>`).join('')}</ul>` : '<div class="muted">暂无补充点标注。</div>'}
                        </div>
                      </div>
                      ${currentPaperSession?.config?.compareWithHistory ? `
                        <div class="paper-review-block history-compare-block">
                          <div class="relation-title">得分点覆盖对照</div>
                          <div class="meta-row">${pill(`本次必写点命中 ${coreCoverage.filter(item => item.matched).length}/${coreCoverage.length || 0}`, true)}${pill(`上次必写点命中 ${historicalCoreCoverage.filter(item => item.matched).length}/${historicalCoreCoverage.length || 0}`)}${pill(`本次补充点命中 ${extraCoverage.filter(item => item.matched).length}/${extraCoverage.length || 0}`)}${pill(`上次补充点命中 ${historicalExtraCoverage.filter(item => item.matched).length}/${historicalExtraCoverage.length || 0}`)}${coreCoverage.filter(item => item.matched).length > historicalCoreCoverage.filter(item => item.matched).length ? pill('必写点覆盖提升', true) : coreCoverage.filter(item => item.matched).length < historicalCoreCoverage.filter(item => item.matched).length ? pill('必写点覆盖回落') : pill('必写点覆盖持平')}</div>
                          <div class="answer-analysis muted">说明：这里采用保守关键词命中法，只用于复盘提示，不等同于正式人工判分。</div>
                        </div>
                      ` : ''}
                    `}
                    ${currentPaperSession?.submitted && subjectiveTypes.includes(q.type) && currentPaperSession?.config?.compareWithHistory ? `
                      <div class="paper-review-block history-compare-block">
                        <div class="relation-title">前后对照提示</div>
                        <div class="answer-analysis muted">${historicalAnswer && currentAnswer ? (coreCoverage.filter(item => item.matched).length > historicalCoreCoverage.filter(item => item.matched).length ? '这次命中的必写点比上次更多，说明答案主干更完整了。' : coreCoverage.filter(item => item.matched).length < historicalCoreCoverage.filter(item => item.matched).length ? '这次命中的必写点比上次更少，建议重新核对主干框架是否写全。' : historicalAnswer === currentAnswer ? '这次与上次作答完全一致，建议重点检查是否真正补上了关键得分点。' : '这次作答与上次已有变化，但必写点覆盖度接近，建议继续优化表达与补充点。') : '当前仅能做基础对照，建议补完本次作答后再看变化。'} </div>
                      </div>
                    ` : ''}
                    ${currentPaperSession?.submitted && subjectiveTypes.includes(q.type) ? `<div class="cta-row"><button class="cta secondary paper-mark-subjective-weak-btn" data-question-id="${q.id}" data-chapter-id="${q.chapterId}">这题没答好，加入错题/薄弱复盘</button></div>` : ''}
                  ` : ''}
                  <p class="answer-text">${q.answer}</p>
                  <ul class="bullet-list">${(q.scoringPoints || []).map(point => `<li>${point}</li>`).join('')}</ul>
                  ${q.analysis ? `<div class="answer-analysis muted">解析：${q.analysis}</div>` : ''}
                </div>
              </details>
            </div>
          `;}).join('')}
        </section>
      `).join('');

    paperResult.innerHTML = `
      <div class="paper-preview">
        <div class="paper-head">
          <div class="eyebrow">Generated Paper</div>
          <h3>${meta.subjectName}${meta.typeLabel}</h3>
          <p class="muted">当前版本已支持按组卷规格生成更接近考试结构的题目，并可直接在页面上作答与导出。</p>
          <div class="paper-meta">
            ${pill(meta.typeLabel, true)}
            ${pill(`题目 ${picked.length}`)}
            ${pill(`章节 ${meta.chapterName}`)}
            ${pill(meta.modeLabel)}
            ${pill(meta.difficultyLabel)}
            ${pill(meta.templateLabel)}
          </div>
        </div>
        ${renderPaperSummary(picked)}
        ${renderPaperReviewAdvice(picked)}
        ${renderPaperNavigator(picked)}
        <div class="cta-row" style="margin-bottom: 10px;">
          <button class="cta primary" id="submitPaperBtn">${currentPaperSession?.submitted ? '重新查看复盘' : '交卷并进入复盘'}</button>
          <button class="cta secondary" id="clearPaperSessionBtn">清空本卷作答</button>
        </div>
        ${sections}
      </div>
    `;

    document.querySelectorAll('.paper-wrong-toggle-btn').forEach(btn => {
      btn.onclick = () => {
        const added = toggleWrongQuestion(progress, btn.dataset.questionId);
        alert(added ? '已加入错题本' : '已移出错题本');
        renderPaper(latestPaper.picked, latestPaper.meta);
      };
    });

    document.querySelectorAll('.paper-answer-input').forEach(node => {
      node.oninput = () => {
        updatePaperAnswer(node.dataset.questionId, node.value);
        renderPaper(latestPaper.picked, latestPaper.meta);
      };
    });

    document.querySelectorAll('input[type="radio"][name^="answer_"]').forEach(node => {
      node.onchange = () => {
        updatePaperAnswer(node.name.replace('answer_', ''), node.value);
        renderPaper(latestPaper.picked, latestPaper.meta);
      };
    });
    document.querySelectorAll('.paper-nav-item').forEach(btn => {
      btn.onclick = () => {
        const target = document.getElementById(`paper-question-${btn.dataset.targetQuestionId}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });

    document.getElementById('clearPaperSessionBtn').onclick = () => {
      if (!confirm('确定清空当前试卷的作答记录吗？此操作会清除本地保存的本卷答案。')) return;
      currentPaperSession = createPaperSession(latestPaper.picked, latestPaper.meta, currentPaperSession?.config || null);
      writePaperSession(currentPaperSession);
      renderPaper(latestPaper.picked, latestPaper.meta);
    };

    document.querySelectorAll('.paper-mark-subjective-weak-btn').forEach(btn => {
      btn.onclick = () => {
        const questionId = btn.dataset.questionId;
        const chapterId = btn.dataset.chapterId;
        const added = toggleWrongQuestion(progress, questionId);
        progress.weakChapters = unique([...(progress.weakChapters || []), chapterId]);
        writeProgress(progress);
        alert(added ? '已把这道主观题加入错题本，并把对应章节记为薄弱。' : '已把对应章节记为薄弱，你也可以继续手动调整错题本。');
        renderPaper(latestPaper.picked, latestPaper.meta);
      };
    });

    document.getElementById('submitPaperBtn').onclick = () => {
      if (!currentPaperSession) return;
      currentPaperSession.submitted = true;
      currentPaperSession.submittedAt = new Date().toISOString();
      const beforeWrongSet = new Set(progress.wrongQuestionIds || []);
      const beforeWeakSet = new Set(progress.weakChapters || []);
      const wrongSet = new Set(progress.wrongQuestionIds || []);
      const weakSet = new Set(progress.weakChapters || []);
      const chapterStats = {};
      latestPaper.picked.forEach(q => {
        const answer = (currentPaperSession.answers || {})[q.id] || '';
        const answered = typeof answer === 'string' ? answer.trim() : !!answer;
        chapterStats[q.chapterId] = chapterStats[q.chapterId] || { total: 0, weakSignals: 0 };
        chapterStats[q.chapterId].total += 1;
        if (!answered) chapterStats[q.chapterId].weakSignals += 1;
        if (objectiveTypes.includes(q.type) && (!answered || answer !== q.answer)) {
          wrongSet.add(q.id);
          chapterStats[q.chapterId].weakSignals += 1;
        }
      });
      Object.entries(chapterStats).forEach(([chapterId, stat]) => {
        if (stat.weakSignals >= Math.max(1, Math.ceil(stat.total / 2))) weakSet.add(chapterId);
      });
      const performance = getPaperPerformance(latestPaper.picked);
      const newWrongQuestionIds = [...wrongSet].filter(id => !beforeWrongSet.has(id));
      const newWeakChapterIds = [...weakSet].filter(id => !beforeWeakSet.has(id));
      progress.wrongQuestionIds = [...wrongSet];
      progress.weakChapters = [...weakSet];
      progress.paperHistory = (progress.paperHistory || []).map((item, idx) => idx === 0 ? {
        ...item,
        submittedAt: currentPaperSession.submittedAt,
        answeredCount: performance.answeredCount,
        unansweredCount: performance.unansweredCount,
        objectiveTotal: performance.objectiveTotal,
        objectiveCorrectCount: performance.objectiveCorrectCount,
        newWrongQuestionIds,
        newWeakChapterIds,
        answerSnapshot: { ...(currentPaperSession.answers || {}) },
        resultSource: 'paper_submit',
        subjectiveCoverageStats: performance.subjectiveCoverageStats,
        improvementComparedToPrevious: (() => {
          const previousPaper = getPreviousSubmittedPaper(item);
          if (!previousPaper) return 'first_attempt';
          const currentRate = performance.objectiveTotal ? performance.objectiveCorrectCount / performance.objectiveTotal : 0;
          const previousRate = previousPaper.objectiveTotal ? (previousPaper.objectiveCorrectCount || 0) / previousPaper.objectiveTotal : 0;
          if (currentRate > previousRate) return 'improved';
          if (currentRate < previousRate) return 'declined';
          return 'flat';
        })(),
        subjectiveTrendComparedToPrevious: (() => {
          if (!performance.subjectiveCoverageStats.comparedCount) return 'no_subjective_compare';
          if (performance.subjectiveCoverageStats.improvedCount > performance.subjectiveCoverageStats.declinedCount) return 'subjective_improved';
          if (performance.subjectiveCoverageStats.improvedCount < performance.subjectiveCoverageStats.declinedCount) return 'subjective_declined';
          return 'subjective_flat';
        })()
      } : item);
      writeProgress(progress);
      writePaperSession(currentPaperSession);
      renderPaperHistoryActions();
      renderPaper(latestPaper.picked, latestPaper.meta);
      document.querySelectorAll('#paperResult details').forEach(node => node.open = true);
      alert('已交卷并完成基础沉淀：客观题错题已自动加入错题本，表现较弱的章节已自动记入薄弱章节。');
    };
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
    const template = templateSelect.value;

    let filtered = questions.filter(q => q.subjectId === subjectId);
    if (chapterId !== 'all') filtered = filtered.filter(q => q.chapterId === chapterId);
    if (difficulty !== 'all') filtered = filtered.filter(q => q.difficulty === difficulty);
    if (mode === 'objective') filtered = filtered.filter(q => objectiveTypes.includes(q.type));
    if (mode === 'subjective') filtered = filtered.filter(q => subjectiveTypes.includes(q.type));

    let pool = filtered;
    let picked = [];
    if (type === 'high') pool = filtered.filter(q => q.isHighFrequency).length ? filtered.filter(q => q.isHighFrequency) : filtered;

    if (template === 'exam') {
      picked = pickByStructure(pool, getTemplateStructure(template, count));
    } else if (type === 'chapter') {
      picked = pickByPreference(pool, count, ['选择题', '判断题', '名词解释', '简答题', '辨析题', '论述题']);
    } else if (type === 'high') {
      picked = pickByPreference(pool, count, ['选择题', '简答题', '辨析题', '论述题']);
    } else {
      picked = template === 'custom'
        ? pickByPreference(pool, count, ['选择题', '判断题', '名词解释', '简答题', '辨析题', '论述题'])
        : pickByStructure(pool, getTemplateStructure('quick', count));
    }

    const draftHistoryItem = { type, subjectId, chapterId, difficulty, mode, template, createdAt: new Date().toISOString(), questionIds: picked.map(p => p.id) };
    const previousPaper = getPreviousSubmittedPaper(draftHistoryItem);
    progress.paperHistory = [{
      ...draftHistoryItem,
      attemptNumber: previousPaper?.attemptNumber ? previousPaper.attemptNumber + 1 : 1,
      paperTrackKey: getPaperTrackKey(draftHistoryItem)
    }, ...(progress.paperHistory || [])].slice(0, 10);
    writeProgress(progress);

    if (!picked.length) {
      paperResult.innerHTML = '<div class="empty">当前筛选条件下没有可用题目，可以放宽章节、难度或题型模式。</div>';
      return;
    }

    const meta = {
      typeLabel: type === 'chapter' ? '章节卷' : type === 'high' ? '高频冲刺卷' : '真题风格卷',
      subjectName: (subjects.find(s => s.id === subjectId) || {}).name || '未知学科',
      chapterName: chapterId === 'all' ? '全部章节' : ((chapters.find(ch => ch.id === chapterId) || {}).name || '指定章节'),
      modeLabel: mode === 'mixed' ? '混合组卷' : mode === 'objective' ? '客观题模式' : '主观题模式',
      difficultyLabel: difficulty === 'all' ? '全部难度' : difficulty === 'easy' ? '基础' : difficulty === 'medium' ? '中等' : '提升',
      templateLabel: template === 'exam' ? '考试题量卷' : template === 'custom' ? '自定义题量' : '快速训练卷'
    };
    currentPaperSession = createPaperSession(picked, meta, { type, subjectId, chapterId, difficulty, mode, template, count });
    writePaperSession(currentPaperSession);
    latestPaper = { picked, meta };
    renderPaperHistoryActions();
    renderPaper(picked, meta);
  };

  document.getElementById('exportPaperBtn').onclick = () => {
    if (!latestPaper) {
      alert('请先生成试卷，再导出。');
      return;
    }
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${latestPaper.meta.subjectName}${latestPaper.meta.typeLabel}</title></head><body>${paperResult.innerHTML}</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'psy-paper-export.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  renderPaperHistoryActions();

  if (currentPaperSession?.questionIds?.length) {
    const restored = currentPaperSession.questionIds.map(id => questions.find(q => q.id === id)).filter(Boolean);
    if (restored.length) {
      latestPaper = { picked: restored, meta: currentPaperSession.meta };
      renderPaper(restored, currentPaperSession.meta);
    }
  }
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
        ${useTextarea ? `<textarea id="manage_${key}" rows="${['stem','answer','analysis','summary'].includes(key) ? 6 : 4}">${value}</textarea>` : `<input type="text" id="manage_${key}" value="${value}" />`}
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
  const lastSubmittedPaper = paperHistory.find(item => item.submittedAt);

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
  if (lastSubmittedPaper) {
    const latestWeakChapters = chapters.filter(ch => (lastSubmittedPaper.newWeakChapterIds || []).includes(ch.id));
    weaknessCards.push(`
      <div class="note-card training-result-card submitted">
        <div class="training-result-title">最近一次试卷结果</div>
        <div class="meta-row">
          ${pill(`已作答 ${lastSubmittedPaper.answeredCount || 0}`, true)}
          ${pill(`未作答 ${lastSubmittedPaper.unansweredCount || 0}`)}
          ${pill(`客观题 ${lastSubmittedPaper.objectiveCorrectCount || 0}/${lastSubmittedPaper.objectiveTotal || 0}`)}
          ${pill(`新增错题 ${(lastSubmittedPaper.newWrongQuestionIds || []).length}`)}
        </div>
        <div class="training-result-note">${getPaperTrendSummary(lastSubmittedPaper, chapters) || (latestWeakChapters[0] ? `这次试卷优先暴露的是「${latestWeakChapters[0].name}」相关问题，建议先回章再刷一套同主题卷。` : '最近一次试卷已经回灌到进度页，可直接结合错题本和薄弱章节继续推进。')}</div>
        <div class="cta-row">
          <a class="quick-link" href="./psy-papers.html">去测试卷中心继续练</a>
          ${latestWeakChapters[0] ? `<a class="quick-link" href="./psy-chapter.html?chapter=${latestWeakChapters[0].id}">回到薄弱章节</a>` : ''}
        </div>
      </div>
    `);
  }
  if (weakChapters.length) {
    weaknessCards.push(...weakChapters.map(ch => `
      <div class="note-card">
        <h4>${ch.name}</h4>
        <p class="muted">建议优先回看本章重点与易混点，再做一套章节卷。</p>
        <div class="meta-row">${pill((lastSubmittedPaper?.newWeakChapterIds || []).includes(ch.id) ? '来源：试卷自动识别' : '来源：手动标记')}</div>
        <div class="cta-row">
          <a class="quick-link" href="./psy-chapter.html?chapter=${ch.id}">进入本章</a>
          <a class="quick-link" href="./psy-papers.html">去测试卷中心</a>
        </div>
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
      <div class="note-card training-result-card ${item.submittedAt ? 'submitted' : ''}">
        <div class="training-result-title">${subjectName}${typeLabel}</div>
        <div class="training-result-note">章节范围：${chapterName}</div>
        <div class="meta-row">
          ${pill(modeLabel)}
          ${pill(difficultyLabel)}
          ${pill(`题目 ${item.questionIds.length}`)}
          ${pill(`第 ${item.attemptNumber || 1} 次`, !!item.attemptNumber)}
          ${item.submittedAt ? pill('已交卷', true) : pill('仅生成未交卷')}
          ${item.improvementComparedToPrevious === 'improved' ? pill('较上次进步', true) : item.improvementComparedToPrevious === 'declined' ? pill('较上次回落') : item.improvementComparedToPrevious === 'flat' ? pill('较上次持平') : ''}
          ${item.subjectiveTrendComparedToPrevious === 'subjective_improved' ? pill('主观题覆盖提升', true) : item.subjectiveTrendComparedToPrevious === 'subjective_declined' ? pill('主观题覆盖回落') : item.subjectiveTrendComparedToPrevious === 'subjective_flat' ? pill('主观题覆盖持平') : ''}
        </div>
        ${item.submittedAt ? `<div class="meta-row">${pill(`已作答 ${item.answeredCount || 0}`)}${pill(`未作答 ${item.unansweredCount || 0}`)}${pill(`客观题 ${item.objectiveCorrectCount || 0}/${item.objectiveTotal || 0}`)}${pill(`新增错题 ${(item.newWrongQuestionIds || []).length}`)}${pill(`新增薄弱章节 ${(item.newWeakChapterIds || []).length}`)}</div>` : ''}
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
