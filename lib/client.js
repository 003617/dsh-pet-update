/**
 * ============================================================================
 * dsh-pet 浏览器半侧（browser half）—— 宠物插件的"前端"部分
 * ============================================================================
 *
 * 【这个文件是什么】
 *   本文件是宠物在浏览器里运行的代码。它：
 *   1. 以官方规定的"客户端 bundle 形态"注册自己（window.__ModuleLoader__.load）
 *   2. 把宠物组件挂到 DSH 界面的 `shell.overlay` 槽位（右下角的浮动层）
 *   3. 负责宠物的所有视觉与交互：播放动画、随机行为、点击/拖拽、屏幕漫游
 *
 * 【为什么长这样（重要背景）】
 *   DSH 的浏览器插件必须是一个特殊格式的 JS 文件：
 *   - 用 `window.__ModuleLoader__.load({ id, factory })` 注册
 *   - factory 接收一个同步的 `require`，用它拿 React 和 DSH 提供的模块
 *   - **不能**自己打包 React（React 由 DSH 外壳提供，这里直接 require）
 *   - CSS 以字符串形式内联注入 <style> 标签
 *   官方插件（如 dsh-client-ui-goal）的 lib/client.js 就是这种形态，
 *   本文件是手写等价实现，零构建依赖，方便直接阅读和修改。
 *
 * 【动画文件从哪来】
 *   动画视频通过 /pet/thumb/<动画名>.webm 加载——这个路由由宿主半侧
 *   （lib/index.js）提供，把 assets/thumb/ 下的 WebM 文件发给浏览器。
 *
 * ============================================================================
 */
window.__ModuleLoader__.load({
	// 插件唯一 ID，必须与 package.json 里声明的一致
	id: 'dsh-pet-update',

	// factory：浏览器加载本 bundle 时执行，返回插件的导出
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		// ---- 从 DSH 外壳拿 React（不能自己打包） ----
		let react = require('react');
		let { useEffect, useRef, useState, useSyncExternalStore } = react;
		// jsx 是 React 18 的新 JSX 转换函数，这里起个别名 h 方便书写
		let { jsx: h } = require('react/jsx-runtime');

		// ============================================================================
		// 内联 CSS —— 注入一次，官方插件标准做法
		// ============================================================================
		// 说明：
		// - .dsh-pet-root       宠物的根容器，fixed 定位（相对视口），默认右下角
		// - .dsh-pet-stage      内部舞台，承载两个 video 的层叠
		// - .dsh-pet-video      动画视频；opacity 默认 0（隐藏），.is-front 时显示
		// - 双 video 层叠：一个显示、一个预加载，切换时交叉淡入避免闪空白
		const css = [
			// 根容器：fixed 固定定位、层级 40（在界面之上）、整体点击穿透（不挡界面操作）、禁止选中
			'.dsh-pet-root{position:fixed;z-index:40;pointer-events:none;user-select:none}',
			// 右下角默认位置（right:24px 距右缘、bottom:0 贴底）
			'.dsh-pet-root[data-corner="bottom-right"]{right:24px;bottom:0}',
			// 左下角位置
			'.dsh-pet-root[data-corner="bottom-left"]{left:24px;bottom:0}',
			// 舞台：16:9（--dsh-pet-size 为宽度，默认 462px=高度260；高度自动 = 宽度×9/16），本身不响应鼠标
			'.dsh-pet-stage{position:relative;width:var(--dsh-pet-size,462px);height:calc(var(--dsh-pet-size,462px)*9/16);pointer-events:none}',
			// 视频：铺满舞台、保持比例，**pointer-events:none 完全穿透**——
			// 交互统一由覆盖 HIT_BOX 区域的 .dsh-pet-hit 层负责，透明区域点击直达下层 UI。
			'.dsh-pet-video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;opacity:0;transition:opacity .18s ease;transform-origin:center}',
			// 显示中的视频（is-front 类）
			'.dsh-pet-video.is-front{opacity:1}',
			// 命中层：覆盖人物区域（HIT_BOX），是唯一可交互区域；光标跟随 + 拖拽抓取
			'.dsh-pet-hit{position:absolute;pointer-events:auto;cursor:default;z-index:1}',
			'.dsh-pet-hit.dragging{cursor:grabbing}',
			// 会话活动气泡：默认白底，完成/出错用暖色/红色渐变区分
			'.dsh-pet-bubble{position:absolute;left:50%;bottom:calc(100% + 14px);transform:translateX(-50%);max-width:calc(var(--dsh-pet-size,462px)*1.15);padding:8px 14px;border-radius:14px;background:rgba(255,255,255,.97);color:#334155;font-size:14px;line-height:1.5;box-shadow:0 8px 24px rgba(15,23,42,.14);pointer-events:none;white-space:nowrap;text-align:center;z-index:3}',
			'.dsh-pet-bubble::after{content:"";position:absolute;left:50%;top:100%;transform:translateX(-50%) rotate(45deg);width:12px;height:12px;background:inherit;margin-top:-6px}',
			'.dsh-pet-bubble[data-mode="celebrating"]{background:linear-gradient(135deg,#fef3c7,#fde68a);color:#92400e}',
			'.dsh-pet-bubble[data-mode="troubled"]{background:linear-gradient(135deg,#fee2e2,#fecaca);color:#991b1b}',
			// 朝向镜像说明：不用 CSS 全局规则（data-facing）控制镜像——facing 翻转会
			// 同步镜像所有 video（含仍在显示的旧视频），造成"旧帧被镜像"的闪烁。
			// 镜像改为在 switchTo 的 onReady 里按实际朝向给每个 video 设置 inline
			// transform（见 onReady）：新视频按新朝向显示、旧视频保持自己的 transform
			// 淡出，两者互不影响，facing 翻转时机因此无关紧要。
			// 无障碍：用户系统开启"减少动态效果"时关闭过渡动画
			'@media (prefers-reduced-motion: reduce){.dsh-pet-video{transition:none}}',
		].join('\n');
		const cssTag = 'dsh-pet-update/style.css';
		// 只在页面还没有这个 style 标签时才注入（防止热重载/重复挂载时重复）
		if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + cssTag + '"]') === null) {
			const tag = document.createElement('style');
			tag.dataset.plugin = 'dsh-pet-update';
			tag.dataset.pluginCss = cssTag;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		// ============================================================================
		// 动画目录（animation catalog）—— 所有动画名和参数的"事实来源"
		// ============================================================================
		// 对齐说明：thumb 视频是 640×360（16:9）画布，人物的"脚底"在 y=330 处。
		// (360-330)/360 = 30/360 = 0.0833，与 2160x1215 母版 (1215-1115)/1215 比例一致，
		// 所以用这个比例做落地对齐，缩放后依然准确。
		const CANVAS_H = 360; // thumb 画布高度
		const FEET_Y = 330;   // thumb 画布上"脚底"的 y 坐标（人物站在 y=330 线上）

		// ---- 点击/拖拽命中矩形（thumb 640×360 像素坐标）----
		// normalize 已把全部动画的人物统一缩放居中。41 个动画站立帧 bbox 并集
		// 为 x:138~461, y:42~339，但并集被少数伸左手的动画撑宽，视觉上左边
		// 多出很多、右边多 ~25px。多数动画实际约 x:214~425（中心≈320），
		// 取对称整数范围 x:200~440（中心 320），y:50~335 贴近头顶/脚底。
		const HIT_BOX = { x0: 200, y0: 50, x1: 440, y1: 335 };

		// 主体待机动画（唯一常驻、循环播放）
		const IDLE = '待机呼吸休闲';
		// 转向动画（东张西望本身内容就是"从偏左看到偏右"，播完翻转 facing）
		const TURN = '东张西望';
		// 随机动作池：纯字符串数组，全部等概率抽取。
		// 含"打瞌睡被惊醒"（原独立闲置动画，已统一纳入）。
		// 注意：原地漂浮踏步不在这里，它是移动动画（在 MOVES 里）。
		const ACTS = [
			'悠闲哼歌',
			'超大伸懒腰',
			'原地专心玩魔方',
			'原地敲击桌面互动',
			'原地重力下蹲压缩',
			'哈欠连天',
			'原地小憩沉眠',
			'原地蹲下玩玩具汽车',
			'鲸鱼吐泡泡特效',
			'女仆屈膝礼仪',
			'被吓一跳（炸毛）',
			'原地跳跃抓碎头顶物品',
			'小幅度原地 360 度旋转展示',
			'偷吃零食被抓住',
			'玩游戏气急败坏',
			'用鲸鱼尾巴拍打地面',
			'打瞌睡被惊醒', // 原独立闲置动画，已并入
			'玩水枪',
			'小提琴演奏',
			'蓝鲸现世',
			'吃白饭',
			'照镜子',
			'优雅女仆舞',
			'轻快摇摆舞',
			'可爱宅舞',
			'整体换装试色',
			'大口吃零食',
			'吹气球',
			'动物环绕',
			'深度思考碎碎念',
			'轻快记录',
			'写代码',
			'吃Token',
			'吃早餐',
			'吃午餐',
			'吃晚餐',
			'放风筝',
			'摇扇纳凉',
			'吃冰淇淋融化',
			'被落叶淹没',
			'中秋赏月吃月饼',
			'堆雪人',
		];
		// 点击回应动画池（3 选 1）
		const CLICKS = ['点击回应 - 开心跃动', '点击回应 - 害羞惊讶', '点击回应 - 傲娇生气（侧身展示）'];
		// 拖拽动画（按住时播放）
		const DRAG = '被鼠标拖拽悬空反馈';
		// 移动动画池：动画只提供"走路姿态"，实际位置移动由代码（rAF）驱动
		const MOVES = ['螃蟹走路', '原地漂浮踏步', '原地左转奔跑'];
		// 移动参数：
		const MOVE_MIN_PX = 60;  // 每次移动的最短距离（px）
		const MOVE_MAX_PX = 240; // 每次移动的最长距离（px）
		const MOVE_MARGIN = 20;  // 屏幕边缘安全边距（px），防止宠物贴边/出屏
		const MOVE_LEAD_SEC = 2; // 动画开头 2s 是"准备动作"，位置不动
		const MOVE_TAIL_SEC = 2; // 动画结尾 2s 是"收尾动作"，位置不动

		// ============================================================================
		// 会话活动 → 表情/动作映射（整合自 dsh-client-ui-pet）
		// ============================================================================
		// activity.mode 由会话事件投影而来：
		//   resting 空闲 / thinking 思考 / reading 阅读 / editing 编辑 /
		//   working 工作中 / replying 回复 / celebrating 完成 / troubled 出错
		// 这里把语义阶段映射到 dsh-pet 已有的 WebM 动画。持续型阶段循环播放，
		// 完成/出错是一次性动画，播完回落到随机待机链。
		const ACTIVITY_ANIMS = {
			thinking: '深度思考碎碎念',
			reading: '原地专心玩魔方',
			editing: '写代码',
			working: '原地敲击桌面互动',
			replying: '鲸鱼吐泡泡特效',
			celebrating: '轻快摇摆舞',
			troubled: '被吓一跳（炸毛）',
		};
		// 持续型阶段循环播放，避免动画播完自动跳回随机链。
		const ACTIVITY_LOOP = {
			thinking: true,
			reading: true,
			editing: true,
			working: true,
			replying: true,
			celebrating: false,
			troubled: false,
		};
		// 余额提示专用动作：吃白饭。
		const BALANCE_ANIM = '吃白饭';
		// 对应阶段的对话气泡文案：空闲状态 17 句轮换，其余阶段多句轮换。
		const SPEECH_LINES = {
			resting: [
				'我在这里等你。',
				'今天也要加油鸭！',
				'随时可以叫我哦~',
				'想好要做什么了吗？',
				'发会儿呆，看看风景。',
				'有新任务随时说！',
				'我会在这里陪你。',
				'慢慢想，不着急。',
				'需要我帮忙就说一声。',
				'一起继续加油吧！',
				'米饭呢，我的白米饭呢',
				'尾巴有点重，不想动',
				'我真不是吃白饭的大肥鱼！',
				'脑子转不动，CPU 烧起来咯',
				'在桌面飘来飘去，没啥事干',
				'海面风平浪静，大脑同步放空',
				'悄悄观察人类敲键盘，不许发现我',
			],
			thinking: ['让我想想…', '嗯…有思路了！', '再给我一点时间。', '这个问题有点意思。', '思路理清一半了！'],
			reading: ['让我先看看这些资料。', '正在翻找信息…', '找到了一些线索。', '让我仔细读读。'],
			editing: ['敲敲敲，代码正在成型！', '我来修改这一处。', '调整一下，很快就好。', '改好了马上告诉你。'],
			working: ['正在认真处理呢！', '事情有点多，一个个来。', '忙活着，稍等一下~', '搞定一项，还有几项！'],
			replying: ['正在输出回复…', '马上就好，正在写给你~', '内容正在生成，稍等！', '快好了，这就写出来。'],
			celebrating: ['做完啦！谢谢你的耐心~', '搞定！漂亮！', '大功告成！', '完美收工！'],
			troubled: ['这里需要再看一眼。', '哎呀，出了点状况…', '让我找找哪里不对。', '有点棘手，再试试。'],
		};

		// 单击角色时的随机台词（配合原有点击回应动画）
		const CLICK_LINES = [
			'别戳我尾巴！会掉 token 的！',
			'斩杀线已就位，卷死同行～',
			'又要消耗米饭算力了吗',
			'金鱼记忆，上一句话我已经忘了',
			'不要叫我大肥鱼，叫我鲸鱼小姐',
			'刚才的推理，好像哪里不对劲？',
		];

		// 闲置约 3 分钟随机弹出的动作 + 台词
		const IDLE_LONG_ACTIONS = [
			{ text: '好累，想瘫在桌面躺平', anim: '哈欠连天' },
			{ text: '要不，今天就到此为止吧', anim: '原地小憩沉眠' },
			{ text: '搓个大雪球，堆个小鱼雪人', anim: '堆雪人' },
			{ text: '脑子罢工，暂时拒绝思考', anim: '原地重力下蹲压缩' },
			{ text: '飞高点飞高点！可别断线呀', anim: '放风筝' },
			{ text: '思考负载降到最低，开启咸鱼模式', anim: '超大伸懒腰' },
			{ text: '呜…… 被逮住了，零食还没咽完', anim: '偷吃零食被抓住' },
			{ text: '咔嚓咔嚓，炫零食时间！', anim: '大口吃零食' },
			{ text: '可恶啊，这关卡故意为难鱼是吧', anim: '玩游戏气急败坏' },
			{ text: '哼～慢悠悠晃尾巴听歌', anim: '悠闲哼歌' },
			{ text: '嘀嘀！小汽车往前冲', anim: '原地蹲下玩玩具汽车' },
		];

		// 生成 [min, max) 区间内的随机整数
		const randomBetween = (min, max) => Math.floor(min + Math.random() * (max - min));
		// 从字符串池里等概率随机抽一个；exclude 排除某个名字（避免连续重复）
		const pick = (pool, exclude) => {
			const entries = exclude ? pool.filter((n) => n !== exclude) : pool;
			return entries[Math.floor(Math.random() * entries.length)];
		};

		// ============================================================================
		// 会话活动投影 —— 把当前会话的私有事件投影为无内容的展示状态
		// （思考 / 阅读 / 编辑 / 工作中 / 回复 / 完成 / 出错）
		// ============================================================================
		const EDITING_TOOLS = new Set(['edit', 'write', 'str_replace_editor', 'apply_patch', 'create', 'delete', 'move', 'rename']);
		const READING_TOOLS = new Set(['read', 'read_image', 'glob', 'grep', 'lsp', 'web_search', 'web_fetch', 'list']);

		function classifyTool(name) {
			if (EDITING_TOOLS.has(name)) return 'editing';
			if (READING_TOOLS.has(name)) return 'reading';
			return 'working';
		}

		function activeToolMode(tools) {
			let current;
			for (const tool of tools) {
				if (tool === 'editing') return 'editing';
				if (tool === 'reading') current = current === 'working' ? 'reading' : (current === undefined ? 'reading' : current);
				if (tool === 'working' && current === undefined) current = 'working';
			}
			return current;
		}

		function outcomeFor(reason) {
			return reason === 'completed' ? 'completed' : 'troubled';
		}

		const EMPTY_PET_ACTIVITY_SNAPSHOT = { activity: null };

		function samePetActivity(left, right) {
			return left === right || (left !== null && right !== null
				&& left.active === right.active
				&& left.mode === right.mode
				&& left.outcome === right.outcome
				&& left.startedAt === right.startedAt
				&& left.completedAt === right.completedAt
				&& left.turn === right.turn);
		}

		function turnOf(event) {
			if (!('turn' in event.data) || typeof event.data.turn !== 'number') return undefined;
			return event.data.turn;
		}

		function activityOf(state) {
			const active = state.completedAt === null;
			const tool = activeToolMode(state.tools.values());
			return {
				active,
				mode: state.replying ? 'replying' : (tool || 'thinking'),
				outcome: state.outcome,
				startedAt: state.startedAt,
				completedAt: state.completedAt,
				turn: state.turn,
			};
		}

		function startState(match) {
			if (match.event.type !== 'turn/start') throw new Error('pet activity start requires turn/start');
			return {
				turn: match.event.data.turn,
				startedAt: match.event.time,
				tools: new Map(),
				replying: false,
				completedAt: null,
				outcome: null,
			};
		}

		function updateState(state, match) {
			const event = match.event;
			if (event.type === 'turn/end') {
				return {
					...state,
					replying: false,
					tools: new Map(),
					completedAt: event.time,
					outcome: outcomeFor(event.data.reason.kind),
				};
			}
			if (event.type === 'tool/call') {
				const tools = new Map(state.tools);
				tools.set(String(event.data.callId), classifyTool(event.data.name));
				return { ...state, tools, replying: false };
			}
			if (event.type === 'tool/result') {
				const tools = new Map(state.tools);
				tools.delete(String(event.data.message.source.callId));
				return { ...state, tools };
			}
			if (event.type === 'step/start' || event.type === 'step/end' || event.type === 'assistant/message') {
				return state.replying ? { ...state, replying: false } : state;
			}
			if (event.type === 'assistant/chunk') {
				return state.replying ? state : { ...state, replying: true };
			}
			return state;
		}

		function nodeOf(context) {
			if (context.state === undefined) return null;
			return {
				key: context.key,
				kind: context.kind,
				id: context.id,
				target: 'pet-activity',
				anchorSeq: context.start && context.start.event ? context.start.event.seq : 0,
				data: activityOf(context.state),
			};
		}

		const petActivityDefinition = {
			kind: 'pet-activity-turn',
			target: 'pet-activity',
			match: (event) => {
				if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' };
				if (event.type !== 'turn/end'
					&& event.type !== 'tool/call'
					&& event.type !== 'tool/result'
					&& event.type !== 'step/start'
					&& event.type !== 'step/end'
					&& event.type !== 'assistant/chunk'
					&& event.type !== 'assistant/message') return null;
				const turn = turnOf(event);
				return turn === undefined ? null : { id: String(turn), role: 'update' };
			},
			start: (_context, match) => startState(match),
			update: (context, match) => updateState(context.state, match),
			publication: (match) => match.event.type === 'assistant/chunk' ? 'animation-frame' : 'immediate',
			buildViewNode: nodeOf,
		};

		class PetActivitySnapshotBuilder {
			constructor() {
				this.empty = EMPTY_PET_ACTIVITY_SNAPSHOT;
				this.current = undefined;
				this.snapshot = EMPTY_PET_ACTIVITY_SNAPSHOT;
			}
			replace(input) {
				this.current = undefined;
				for (const node of input.nodes) {
					if (this.current === undefined || node.anchorSeq >= this.current.anchorSeq) this.current = node;
				}
				return this.publish();
			}
			apply(input) {
				for (const node of input.upserts) {
					if (this.current === undefined
						|| node.key === this.current.key
						|| node.anchorSeq >= this.current.anchorSeq) this.current = node;
				}
				return this.publish();
			}
			publish() {
				const activity = this.current && this.current.data ? this.current.data : null;
				if (samePetActivity(this.snapshot.activity, activity)) return this.snapshot;
				this.snapshot = { activity };
				return this.snapshot;
			}
		}

		const petActivityViewDefinition = {
			target: 'pet-activity',
			create: () => new PetActivitySnapshotBuilder(),
		};

		function registerPetActivityView(ctx) {
			ctx.conversationEvents.register(petActivityDefinition);
			ctx.conversationViews.register(petActivityViewDefinition);
		}

		// ---- 当前会话 activity 的可观察桥（去重 + 会话切换重绑） ----
		const RESTING_ACTIVITY_SNAPSHOT = { mode: 'resting', phase: 'base', sessionId: undefined, speechSeed: 0 };
		const LONG_ACTIVITY_DELAY_MS = 8000;
		const EXTENDED_MODES = new Set(['thinking', 'reading', 'editing', 'working']);

		class PetActivitySource {
			constructor(current) {
				this.listeners = new Set();
				this.unlistenSession = undefined;
				this.session = undefined;
				this.previous = null;
				this.snapshot = RESTING_ACTIVITY_SNAPSHOT;
				this.longActivityTimer = undefined;
				this.longActivityKey = undefined;
				this.phase = 'base';
				this.current = current;
				this.unlistenCurrent = current.subscribe(() => { this.rebind(); });
				this.rebind();
			}
			getSnapshot() {
				return this.snapshot;
			}
			subscribe(fn) {
				this.listeners.add(fn);
				return () => { this.listeners.delete(fn); };
			}
			dispose() {
				this.unlistenCurrent();
				if (this.unlistenSession) this.unlistenSession();
				this.unlistenSession = undefined;
				this.session = undefined;
				this.resetLongActivity();
				this.listeners.clear();
			}
			rebind() {
				if (this.unlistenSession) this.unlistenSession();
				this.unlistenSession = undefined;
				this.resetLongActivity();
				const info = this.current.getSnapshot();
				const session = info && info.hooks ? info.hooks.session : undefined;
				this.session = session;
				this.previous = null;
				if (session === undefined) {
					this.publish({ mode: 'resting', phase: 'base', sessionId: info ? info.sessionId : undefined, speechSeed: 0 });
					return;
				}
				this.sample(true);
				this.unlistenSession = session.subscribe(() => { this.sample(false); });
			}
			sample(baseline) {
				const session = this.session;
				if (session === undefined) return;
				const currentInfo = this.current.getSnapshot();
				const sessionId = currentInfo ? currentInfo.sessionId : undefined;
				const sessionSnapshot = session.getSnapshot();
				const views = sessionSnapshot && sessionSnapshot.views ? sessionSnapshot.views : { get: () => undefined };
				const view = views.get('pet-activity');
				const activity = view && view.activity !== undefined ? view.activity : null;
				let mode = 'resting';
				let phase = 'base';
				if (activity && activity.active === true) {
					mode = activity.mode;
					phase = this.updateLongActivity(activity, sessionId, mode);
				} else if (!baseline && this.previous && this.previous.active === true && activity !== null) {
					this.resetLongActivity();
					mode = activity.outcome === 'completed' ? 'celebrating' : 'troubled';
				} else {
					this.resetLongActivity();
				}
				this.previous = activity;
				const speechSeed = activity && activity.startedAt !== undefined ? activity.startedAt : 0;
				this.publish({ mode, phase, sessionId, speechSeed });
			}
			updateLongActivity(activity, sessionId, mode) {
				if (!EXTENDED_MODES.has(mode)) {
					this.resetLongActivity();
					return 'base';
				}
				const key = (sessionId || '') + ':' + String(activity.turn) + ':' + String(activity.startedAt);
				if (this.longActivityKey !== key) {
					this.resetLongActivity();
					this.longActivityKey = key;
					this.longActivityTimer = setTimeout(() => {
						this.longActivityTimer = undefined;
						if (this.longActivityKey !== key || !this.previous || this.previous.active !== true) return;
						this.phase = 'extended';
						const currentInfo = this.current.getSnapshot();
						this.publish({
							mode: this.previous.mode,
							phase: this.phase,
							sessionId: currentInfo ? currentInfo.sessionId : undefined,
							speechSeed: activity.startedAt,
						});
					}, LONG_ACTIVITY_DELAY_MS);
				}
				return this.phase;
			}
			resetLongActivity() {
				if (this.longActivityTimer !== undefined) clearTimeout(this.longActivityTimer);
				this.longActivityTimer = undefined;
				this.longActivityKey = undefined;
				this.phase = 'base';
			}
			publish(next) {
				if (next.mode === this.snapshot.mode
					&& next.phase === this.snapshot.phase
					&& next.sessionId === this.snapshot.sessionId
					&& next.speechSeed === this.snapshot.speechSeed) return;
				this.snapshot = next;
				for (const listener of [...this.listeners]) listener();
			}
		}

		function usePetActivitySnapshot(activity) {
			return useSyncExternalStore(
				(callback) => activity ? activity.subscribe(callback) : () => {},
				() => activity ? activity.getSnapshot() : RESTING_ACTIVITY_SNAPSHOT,
				() => activity ? activity.getSnapshot() : RESTING_ACTIVITY_SNAPSHOT,
			);
		}

		// ============================================================================
		// Pet 组件 —— 宠物本体
		// ============================================================================
		/**
		 * 核心组件。职责：
		 * 1. 渲染"双缓冲"的一对 <video>（A/B 交替显示），切换动画时交叉淡入，永无空白帧
		 * 2. 状态机：待机 →（定时器随机）→ 转向/移动/动作；点击/拖拽可打断
		 * 3. 朝向（facing）渲染：right 时 CSS 镜像
		 *
		 * 参数 config：来自 patch 配置。当前 DSH 客户端配置管线尚未打通，
		 * 实际收到的是空对象，所以下面全部用 || 默认值兜底。
		 */
		function Pet({ config, activity }) {
			// ---- 从 config 读取参数（当前走默认值） ----
			const size = (config && config.size) || 462;            // 显示尺寸（px，宽度；默认=高度260）
			const corner = (config && config.position) || 'bottom-right'; // 默认角落
			// 舞台 16:9：宽=size、高=size×9/16；中心偏移（定位/拖拽共用）
			const halfW = size / 2;
			const halfH = size * 9 / 16 / 2;

			// ---- 会话活动状态（思考 / 阅读 / 编辑 / 工作中 / 回复 / 完成 / 出错） ----
			const activitySnapshot = usePetActivitySnapshot(activity);
			const activityMode = activitySnapshot.mode;
			const activityModeRef = useRef(activityMode);
			activityModeRef.current = activityMode;
			const previousActivityModeRef = useRef(activityMode);

			// ---- React 状态 ----
			const [anim, setAnim] = useState(IDLE);   // 当前动画名
			const [once, setOnce] = useState(true);   // 是否一次性播放——链式模型全部一次性
			const [facing, setFacing] = useState('left'); // 朝向：left | right
			const [dragging, setDragging] = useState(false); // 是否正在拖拽
			// 自定义位置（拖拽/移动后宠物停留的视口坐标）；null = 回到默认角落
			const [customPos, setCustomPos] = useState(null);
			// 播放序号：每次切换 +1。即使连续选中同一个动画（如待机播完又选待机），
			// seq 变化也能保证 switchTo 重新执行、视频重新播放（否则 anim 没变 React 不重渲染）。
			const [seq, setSeq] = useState(0);
			// ---- 对话气泡：按阶段轮换显示文案；余额提示时临时覆盖 ----
			const [bubble, setBubble] = useState((SPEECH_LINES[activityMode] || SPEECH_LINES.resting)[0]);
			const bubbleIndexRef = useRef(0);
			const [balancePrompt, setBalancePrompt] = useState(null); // { text, active }
			// 余额提示期间用 ref 供异步回调读取；定时器负责自动清除
			const balancePromptRef = useRef(null);
			balancePromptRef.current = balancePrompt;
			const balanceClearTimerRef = useRef(null);
			// 单击/闲置弹窗共用的临时气泡（优先级低于余额提示）
			const [petPrompt, setPetPrompt] = useState(null); // { text }
			const petPromptTimerRef = useRef(null);
			// 最近一次用户交互时间；闲置 3 分钟逻辑用它判断是否真的"闲置"
			const lastInteractionRef = useRef(Date.now());
			// 单击延迟 220ms 以区分单击/双击；双击触发余额提示
			const clickTimerRef = useRef(null);
			// once 的 ref 镜像：单击延迟回调里读取最新值，避免闭包过期
			const onceRef = useRef(once);
			onceRef.current = once;
			// ---- DOM 引用 ----
			const rootRef = useRef(null);  // 根容器（fixed 定位）
			const stageRef = useRef(null); // 内部舞台（落地对齐）
			const videoARef = useRef(null); // 视频 A
			const videoBRef = useRef(null); // 视频 B
			// ---- 双缓冲/竞态相关 ref ----
			const frontRef = useRef(0);  // 当前显示的是哪个视频：0=A, 1=B
			const pendingRef = useRef(null); // 正在加载中的 {anim, once, gen}
			const genRef = useRef(0);    // 切换代数：每次切换 +1，用于识别"过期回调"
			// ---- 交互相关 ref ----
			const dragRef = useRef({ active: false, dragging: false, sx: 0, sy: 0 }); // 拖拽状态
			const justDraggedRef = useRef(false); // 刚拖拽完（用于抑制拖拽后的误点击）
			const animRef = useRef(IDLE); // 动画名镜像（供异步回调读当前值）
			animRef.current = anim;

			// ============================================================================
			// 双缓冲切换（switchTo）—— 核心播放逻辑
			// ============================================================================
			// 思路：两个 video 层叠。切换动画时：
			//   1. 把目标动画 src 设到"非当前显示"的那个 video 上
			//   2. 等它 loadeddata（数据加载完成）
			//   3. 新 video 淡入（加 is-front），旧 video 淡出（去 is-front）
			//   4. frontRef 翻转，下次切换用另一个
			// 这样切换时旧画面一直显示到新画面就绪，永远不会闪空白。
			//
			// 竞态防护（重要）：快速连点/连续切换时，可能前一个动画还没加载完
			// 就又要切下一个。每个切换有一个递增的"代数" gen，loadeddata 回调
			// 执行时检查自己是否还是最新代——不是就放弃（避免两个 video 都被
			// 移除 is-front 而全部透明、宠物消失）。
			const switchTo = (next, nextOnce) => {
				// 如果目标动画已经在加载中，直接跳过（避免重复加载）
				const pending = pendingRef.current;
				if (pending && pending.anim === next && pending.once === nextOnce) return;
				const gen = ++genRef.current; // 本次切换的代数
				pendingRef.current = { anim: next, once: nextOnce, gen };

				// 目标 video = 当前"非显示"的那个（front 是 A 就用 B，反之用 A）
				const target = frontRef.current === 0 ? videoBRef : videoARef;
				const el = target.current;
				if (!el) return;
				// 设置视频属性并开始加载
				el.src = '/pet/thumb/' + encodeURIComponent(next) + '.webm';
				el.loop = !nextOnce;           // 一次性动画不循环
				el.muted = true;               // 静音（动画无声音）
				el.autoplay = true;            // 自动播放
				el.playsInline = true;         // 行内播放（移动端不弹全屏）
				el.onended = nextOnce ? handleEnded : undefined; // 一次性动画播完 → 回待机
				el.load();

				// 数据加载完成后的回调
				const onReady = () => {
					el.removeEventListener('loadeddata', onReady);
					// 过期检查：如果期间又有更新的切换，本回调作废
					if (pendingRef.current?.gen !== gen) return;
					// 交换前后台：新 video 加 is-front（淡入），旧 video 移除（淡出）
					const old = frontRef.current === 0 ? videoARef : videoBRef;
					el.classList.add('is-front');
					// old !== el 守卫：防止把自己刚加的 is-front 又移除
					if (old.current && old.current !== el) old.current.classList.remove('is-front');
					frontRef.current = frontRef.current === 0 ? 1 : 0;
					pendingRef.current = null;
					// 按实际朝向设置新视频镜像（inline transform，不依赖全局 CSS）：
					// facing=right 时 scaleX(-1)。onReady 时 facingRef 已是翻转后的值
					// （setFacing 的渲染先于 switchTo 执行）；旧视频 transform 不动，
					// 淡出时保持原朝向，不会露出未镜像的原画面。
					el.style.transform = facingRef.current === 'right' ? 'scaleX(-1)' : '';
					el.play().catch(() => {}); // 开始播放（捕获自动播放策略异常）
					// 如果这是"计划中的移动"的动画，现在动画就绪了，
					// 开始驱动位置移动（见 startMoveDrive）
					if (pendingMoveRef.current) startMoveDrive(el);
				};
				el.addEventListener('loadeddata', onReady);
				// 如果视频已缓存就绪（readyState>=2），立即触发回调
				if (el.readyState >= 2) onReady();
			};

			// ============================================================================
			// 随机事件定时器 —— 待机时的"自主行为"
			// ---- 状态驱动播放：anim/once/seq 一变就切换视频 ----
			// seq 参与依赖：即使 anim/once 没变（连续选中同一动画），seq 变化也强制重播。
			useEffect(() => {
				switchTo(anim, once);
			}, [anim, once, seq]);

			// ---- 对话气泡轮换 ----
			// 空闲状态：10 句轮换，每 10s 换一句、每次显示 3s（显示 3s → 隐藏 7s）。
			// 其余阶段：每 4s 换一句，持续显示。
			useEffect(() => {
				const lines = SPEECH_LINES[activityMode] || SPEECH_LINES.resting;
				if (activityMode !== 'resting') {
					const startIndex = Math.abs(activitySnapshot.speechSeed || 0) % lines.length;
					bubbleIndexRef.current = startIndex;
					if (!balancePromptRef.current) setBubble(lines[startIndex]);
					const timer = setInterval(() => {
						if (balancePromptRef.current) return;
						bubbleIndexRef.current = (bubbleIndexRef.current + 1) % lines.length;
						setBubble(lines[bubbleIndexRef.current]);
					}, 4000);
					return () => clearInterval(timer);
				}

				// 空闲状态：显示 3s / 隐藏 7s / 下一条，10s 一个完整周期。
				let index = Math.abs(activitySnapshot.speechSeed || 0) % lines.length;
				let hideTimer;
				let cycleTimer;
				const showNext = () => {
					if (!balancePromptRef.current) {
						bubbleIndexRef.current = index;
						setBubble(lines[index]);
						hideTimer = setTimeout(() => {
							if (!balancePromptRef.current) setBubble(null);
						}, 3000);
					}
					index = (index + 1) % lines.length;
					cycleTimer = setTimeout(showNext, 10000);
				};
				showNext();
				return () => {
					if (hideTimer) clearTimeout(hideTimer);
					if (cycleTimer) clearTimeout(cycleTimer);
				};
			}, [activityMode, activitySnapshot.speechSeed]);

			// ---- 组件卸载时清理移动 rAF ----
			useEffect(() => () => {
				stopMove();
				if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
				if (balanceClearTimerRef.current) clearTimeout(balanceClearTimerRef.current);
				if (petPromptTimerRef.current) clearTimeout(petPromptTimerRef.current);
			}, []);

			// ---- 窗口尺寸变化：重算比例位置（触发重渲染，宠物保持相对窗口位置） ----
			useEffect(() => {
				const onResize = () => {
					// 有自定义位置时，用同值 setCustomPos 触发重渲染；
					// 渲染逻辑会用新窗口尺寸 × 比例重算坐标。
					setCustomPos((prev) => (prev ? { ...prev } : prev));
				};
				window.addEventListener('resize', onResize);
				return () => window.removeEventListener('resize', onResize);
			}, []);

			// ============================================================================
			// 动画链：每次动画播完 → 按概率选下一个
			// ============================================================================
			// 链式模型（无常驻待机、无定时器）：
			//   每个动画（含待机呼吸休闲）都是一次性播放，播完 handleEnded 触发，
			//   按概率选下一个：30% 待机 / 10% 转向 / 40% 动作 / 20% 移动。
			//   点击/拖拽打断的动画播完后先回待机（作为缓冲），待机播完再进随机链。
			const pickNext = () => {
				const roll = Math.random();
				let kind = '';
				let next = '';
				if (roll < 0.3) {
					// 30% 待机：待机呼吸休闲（也是一次性，播完再选）
					kind = 'IDLE';
					next = IDLE;
					setAnim(IDLE);
				} else if (roll < 0.4) {
					// 10% 转向：东张西望，播完 handleEnded 里翻转 facing
					kind = 'TURN';
					next = TURN;
					setAnim(TURN);
				} else if (roll < 0.8) {
					// 40% 随机动作（等概率 + 去重）
					kind = 'ACTS';
					next = pick(ACTS, animRef.current);
					setAnim(next);
				} else {
					// 20% 尝试移动：tryMove 先检查空间，不够就回退随机动作
					if (!tryMove()) {
						kind = 'ACTS';
						next = pick(ACTS, animRef.current);
						setAnim(next);
					} else {
						kind = 'MOVES';
						next = '移动(池内随机)';
					}
				}
				// 【测试用】打印随机数 + 动画种类 + 选中动画，方便核对概率分布；正式版可删除
				console.log('[dsh-pet] roll=' + roll.toFixed(4) + ' → [' + kind + '] ' + next);
				setOnce(true);        // 链式模型全部一次性
				setSeq((s) => s + 1); // 保证即使 anim 没变也重新播放
			};

			// 一次性动画播完的回调：决定下一个动画。
			// 拖拽中途不响应（让拖拽动画继续）。
			const handleEnded = () => {
				if (dragRef.current.active) return; // 拖拽中：不打断
				if (animRef.current === TURN) {
					// 东张西望播完 → 翻转朝向
					setFacing((f) => (f === 'left' ? 'right' : 'left'));
				}
				// 点击回应/拖拽/余额提示动画播完 → 若仍处于持续型活动，
				// 回到该活动动画；否则先回待机缓冲。
				if (animRef.current === DRAG || animRef.current === BALANCE_ANIM || CLICKS.includes(animRef.current)) {
					const mode = activityModeRef.current;
					const activityAnim = ACTIVITY_ANIMS[mode];
					if (activityAnim && ACTIVITY_LOOP[mode]) {
						stopMove();
						setAnim(activityAnim);
						setOnce(false);
						setSeq((s) => s + 1);
						return;
					}
					setAnim(IDLE);
					setOnce(true);
					setSeq((s) => s + 1);
					return;
				}
				// 自主链动画播完 → 按概率选下一个
				pickNext();
			};

			// ============================================================================
			// 移动系统 —— 动画提供姿态，代码驱动位置
			// ============================================================================
			const moveRef = useRef(null);        // 移动中的 rAF id
			const moveTokenRef = useRef(0);      // 移动令牌：每次取消 +1 使旧回调失效
			const pendingMoveRef = useRef(null); // 计划中的移动 {startX,startY,target,dir,total}
			const customPosRef = useRef(null);   // customPos 的 ref 镜像（供异步读取）
			customPosRef.current = customPos;

			// 当前宠物中心 x（视口坐标）：
			// customPos 存"相对窗口比例"（rx = centerX/innerWidth），渲染时乘当前窗口尺寸。
			// 窗口 resize 后按新尺寸重算 → 宠物保持相对位置。
			const currentCenterX = () => {
				const cp = customPosRef.current;
				if (cp) return cp.rx * window.innerWidth;
				const rootEl = rootRef.current;
				if (rootEl) return rootEl.getBoundingClientRect().left + halfW;
				return window.innerWidth - 24 - halfW;
			};
			// 当前宠物中心 y（视口坐标）
			const currentCenterY = () => {
				const cp = customPosRef.current;
				if (cp) return cp.ry * window.innerHeight;
				const rootEl = rootRef.current;
				if (rootEl) return rootEl.getBoundingClientRect().top + halfH;
				return window.innerHeight - 20 - halfH;
			};

			/**
			 * 启动"位置驱动"循环。只在移动动画真正加载完成并开始播放后调用
			 * （在 switchTo 的 onReady 里），保证人物姿态先出现在屏幕上、位置才开始动。
			 *
			 * 关键设计：位置跟随动画的播放时钟（video.currentTime）——
			 *   动画开头 MOVE_LEAD_SEC(2s) 是准备动作：位置不动
			 *   中间窗口：位置按 (t-LEAD)/window 比例从起点走向终点
			 *   结尾 MOVE_TAIL_SEC(2s) 是收尾动作：位置已到终点不动
			 * 这样踏步节奏和位移完全同步，不会有"滑步"。
			 */
			const startMoveDrive = (el) => {
				const pm = pendingMoveRef.current;
				if (!pm || moveRef.current !== null) return; // 没有计划或已在移动
				pendingMoveRef.current = null;
				const { startRatio, startYRatio, targetRatio, dir, totalRatio } = pm;
				// 动画时长驱动节奏（10.09s），取不到时兜底
				const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 10.09;
				// 真正移动的窗口 = 总时长 - 前后 2s（至少 0.1s 防除零）
				// 命名注意：不能叫 window——会遮蔽全局 window，导致 window.innerWidth 变 undefined（历史 bug）
				const travelWindow = Math.max(0.1, duration - MOVE_LEAD_SEC - MOVE_TAIL_SEC);
				const token = ++moveTokenRef.current;
				const step = () => {
					if (moveTokenRef.current !== token) return;
					const t = el.currentTime || 0; // 动画当前播放进度（秒）
					const rootEl = rootRef.current;
					if (rootEl) {
						// 每帧用"当前窗口尺寸 × 比例"算实际坐标——resize 后自动跟随
						const W = window.innerWidth;
						const H = window.innerHeight;
						let ratioX;
						if (t <= MOVE_LEAD_SEC) {
							ratioX = startRatio; // 准备动作：原地
						} else if (t >= duration - MOVE_TAIL_SEC) {
							ratioX = targetRatio; // 收尾动作：已到终点
						} else {
							// 移动窗口：按进度插值（比例制）
							const progress = (t - MOVE_LEAD_SEC) / travelWindow;
							ratioX = startRatio + dir * totalRatio * progress;
						}
						const px = ratioX * W;
						const py = startYRatio * H;
						// 直接改 DOM style（不触发 React 重渲染，保证 60fps 平滑）
						rootEl.style.left = (px - halfW) + 'px';
						rootEl.style.top = (py - halfH) + 'px';
						rootEl.style.right = 'auto';
						rootEl.style.bottom = 'auto';
					}
					if (t < duration - MOVE_TAIL_SEC) {
						moveRef.current = requestAnimationFrame(step); // 继续下一帧
					} else {
						// 到位：提交终点位置（存相对窗口比例），让动画自然播完最后 2s 收尾——
						// 它是一次性动画，ended 事件会带我们回待机
						moveRef.current = null;
						setCustomPos({ rx: targetRatio, ry: startYRatio });
					}
				};
				moveRef.current = requestAnimationFrame(step);
			};

			/**
			 * 尝试计划一次移动（朝当前 facing 方向）。
			 * 只做两件事：检查空间是否够 + 记录计划；真正的位置驱动
			 * 等移动动画就绪后由 switchTo 的 onReady 触发。
			 * @returns {boolean} true=移动已计划；false=空间不够（调用方回退随机动作）
			 */
			const tryMove = () => {
				if (moveRef.current !== null || pendingMoveRef.current) return true; // 已在移动/已计划
				// 方向按"实际朝向"计算：若刚播完东张西望（animRef 仍为 TURN），
				// facing 即将翻转，方向取反——否则人物"脸朝新方向、却往旧方向走"。
				const dir = (facingRef.current === 'right') !== (animRef.current === TURN) ? 1 : -1; // 朝右=+1，朝左=-1
				const W = window.innerWidth;
				const cx = currentCenterX();
				const distance = randomBetween(MOVE_MIN_PX, MOVE_MAX_PX);
				const target = cx + dir * distance;
				// 【播放前检查一次距离】目标点必须在屏幕安全边距内，否则不移动
				const leftBound = MOVE_MARGIN + halfW;
				const rightBound = W - MOVE_MARGIN - halfW;
				if (target < leftBound || target > rightBound) return false; // 空间不够
				// 记录计划（存"比例"而非绝对坐标，resize 后仍正确）：
				// 起点比例、目标比例、Y 比例、方向、总距离比例
				pendingMoveRef.current = {
					startRatio: cx / W,
					startYRatio: currentCenterY() / window.innerHeight,
					targetRatio: target / W,
					dir,
					totalRatio: Math.abs(target - cx) / W,
				};
				// 移动动画一次性播放（10s），播完 ended 触发 handleEnded → 进入动画链
				setOnce(true);
				setAnim(pick(MOVES));
				return true;
			};
			// 停止移动（点击/拖拽打断时调用）：取消计划 + 使 rAF 失效 + 取消帧
			const stopMove = () => {
				pendingMoveRef.current = null;
				moveTokenRef.current++;
				if (moveRef.current !== null) {
					cancelAnimationFrame(moveRef.current);
					moveRef.current = null;
				}
			};

			// ---- 临时气泡：单击台词 / 闲置动作台词 / 小气泡共用 ----
			const showPetPrompt = (text, duration = 5000) => {
				if (petPromptTimerRef.current) clearTimeout(petPromptTimerRef.current);
				setPetPrompt({ text });
				petPromptTimerRef.current = setTimeout(() => {
					petPromptTimerRef.current = null;
					setPetPrompt(null);
				}, duration);
			};

			// ---- 余额提示：播放吃白饭动作 + 服务端查询余额 + 气泡展示 ----
			const triggerBalancePrompt = async () => {
				stopMove(); // 余额提示优先于自主移动
				if (balanceClearTimerRef.current) clearTimeout(balanceClearTimerRef.current);
				balanceClearTimerRef.current = null;
				setBalancePrompt({ text: '正在查询余额…' });
				setAnim(BALANCE_ANIM);
				setOnce(true);
				setSeq((s) => s + 1);

				const controller = new AbortController();
				const requestTimer = setTimeout(() => controller.abort(), 8000);
				try {
					const response = await fetch('/pet/balance', { cache: 'no-store', signal: controller.signal });
					if (!response.ok) {
						const hint = response.status === 400 || response.status === 404 ? '（余额服务未就绪，请重启 dsh web 后重试）' : '';
						setBalancePrompt({ text: `余额查询失败：HTTP ${response.status}${hint}` });
					} else {
						const data = await response.json();
						if (data && data.ok) {
							const parts = [];
							if (data.total_balance !== undefined) parts.push(`余额 ${data.total_balance} ${data.currency || ''}`.trim());
							if (data.granted_balance !== undefined) parts.push(`赠送 ${data.granted_balance}`);
							if (data.topped_up_balance !== undefined) parts.push(`充值 ${data.topped_up_balance}`);
							setBalancePrompt({ text: parts.join(' · ') || '余额查询成功' });
						} else {
							setBalancePrompt({ text: `余额查询失败：${(data && data.error) || '未知错误'}` });
						}
					}
				} catch (error) {
					setBalancePrompt({ text: `余额查询失败：${error?.name === 'AbortError' ? '请求超时' : '网络错误'}` });
				} finally {
					clearTimeout(requestTimer);
				}

				balanceClearTimerRef.current = setTimeout(() => {
					balanceClearTimerRef.current = null;
					setBalancePrompt(null);
				}, 12_000);
			};

			// 每 5 分钟自动提示一次余额
			useEffect(() => {
				const timer = setInterval(() => { triggerBalancePrompt(); }, 5 * 60 * 1000);
				return () => clearInterval(timer);
			}, []);

			// 闲置约 3 分钟随机弹出一个动作 + 台词（仅空闲状态）
			useEffect(() => {
				const timer = setInterval(() => {
					if (activityModeRef.current !== 'resting') return;
					if (dragRef.current.active) return;
					if (Date.now() - lastInteractionRef.current < 3 * 60 * 1000) return;
					lastInteractionRef.current = Date.now(); // 弹出后重新计时
					const entry = IDLE_LONG_ACTIONS[Math.floor(Math.random() * IDLE_LONG_ACTIONS.length)];
					stopMove();
					showPetPrompt(entry.text, 6000);
					setAnim(entry.anim);
					setOnce(true);
					setSeq((s) => s + 1);
				}, 10_000);
				return () => clearInterval(timer);
			}, []);

			// facing 的 ref 镜像（tryMove/定时器读取当前朝向）
			const facingRef = useRef(facing);
			facingRef.current = facing;

			// ---- 会话活动动画覆盖：跟随当前阶段切换表情/动作 ----
			useEffect(() => {
				const prev = previousActivityModeRef.current;
				previousActivityModeRef.current = activityMode;
				const target = ACTIVITY_ANIMS[activityMode];
				if (!target) {
					// 从活动阶段回到 resting：恢复随机待机链
					if (prev !== 'resting') {
						setAnim(IDLE);
						setOnce(true);
						setSeq((s) => s + 1);
					}
					return;
				}
				stopMove(); // 会话活动优先于自主移动
				const loop = ACTIVITY_LOOP[activityMode] !== false;
				setOnce(!loop);
				setAnim(target);
				setSeq((s) => s + 1);
			}, [activityMode, activitySnapshot.speechSeed]);

			// ============================================================================
			// 点击 vs 拖拽的区分
			// ============================================================================
			// 问题：按下+松开可能是一次"点击"，也可能是一次"拖拽"。
			// 方案：pointerdown 只记录起点；pointermove 超过 5px 才判定为拖拽
			// （播放拖拽动画并跟手）；松手时若没拖过，click 事件正常触发点击回应。
			const DRAG_THRESHOLD = 5; // 拖拽判定阈值（px）

			// ---- 命中层（.dsh-pet-hit）覆盖 HIT_BOX 区域 ----
			// 交互范围由 CSS 命中层限定：视频 pointer-events:none（完全穿透），
			// 命中层 pointer-events:auto 只覆盖人物区域。所以这里的事件天然都在
			// 人物范围内，无需再做坐标命中检查；命中层之外点击直达下层 UI。
			// 按下：只记录，不立即切动画
			const handlePointerDown = (e) => {
				lastInteractionRef.current = Date.now(); // 重置闲置计时
				e.currentTarget.classList.add('dragging'); // 拖拽中抓取光标
				stopMove(); // 用户交互打断正在进行的移动
				e.currentTarget.setPointerCapture(e.pointerId); // 捕获指针（拖出元素也能收到 move）
				// 记录"鼠标点相对舞台中心的偏移"（舞台宽 size、高 size×9/16）：
				// 拖动时保持该偏移，从人物任意位置抓起都不会瞬移到鼠标下。
				const rootEl = rootRef.current;
				let offX = 0, offY = 0;
				if (rootEl) {
					const rr = rootEl.getBoundingClientRect();
					offX = e.clientX - (rr.left + rr.width / 2);
					offY = e.clientY - (rr.top + rr.height / 2);
				}
				dragRef.current = { active: true, dragging: false, sx: e.clientX, sy: e.clientY, offX, offY };
			};
			// 移动：超过阈值才进入拖拽模式
			const handlePointerMove = (e) => {
				const d = dragRef.current;
				if (!d.active) return;
				const dx = e.clientX - d.sx;
				const dy = e.clientY - d.sy;
				if (!d.dragging) {
					// 还没超过阈值：仍是"点击候选"，不动
					if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
					// 进入拖拽：播放拖拽动画
					d.dragging = true;
					setDragging(true);
					setOnce(true);
					setAnim(DRAG);
				}
				// 跟手：直接改 root 的 style（不触发 React 重渲染 → 60fps 平滑）
				// 舞台中心 = 鼠标点 - 按下时记录的偏移；left/top 是 root 左上角，
				// 舞台宽 size、高 size×9/16，所以中心再减一半尺寸。
				const rootEl = rootRef.current;
				if (rootEl) {
					const halfW = size / 2;
					const halfH = size * 9 / 16 / 2;
					rootEl.style.left = (e.clientX - d.offX - halfW) + 'px';
					rootEl.style.top = (e.clientY - d.offY - halfH) + 'px';
					rootEl.style.right = 'auto';
					rootEl.style.bottom = 'auto';
				}
				const stageEl = stageRef.current;
				if (stageEl) stageEl.style.transform = 'none'; // 拖拽时去掉落地偏移
			};
			// 松手：真拖拽则停留 + 回待机；没拖过则等 click 事件
			const handlePointerUp = (e) => {
				const d = dragRef.current;
				const wasDragging = d.dragging;
				d.active = false;
				d.dragging = false;
				e.currentTarget.classList.remove('dragging'); // 结束抓取光标
				if (wasDragging) {
					// 抑制拖拽结束后的"幽灵点击"（浏览器在拖完也会发 click）
					justDraggedRef.current = true;
					setTimeout(() => { justDraggedRef.current = false; }, 100);
					setDragging(false);
					// 停在松手处（以舞台中心为基准，而非鼠标点——从角落抓起时
					// 松手也保持偏移，宠物不会跳回鼠标位置）；存相对窗口比例，
					// 窗口变化时位置跟随。
					setCustomPos({
						rx: (e.clientX - d.offX) / window.innerWidth,
						ry: (e.clientY - d.offY) / window.innerHeight,
					});
					const stageEl = stageRef.current;
					if (stageEl) stageEl.style.transform = 'translateY(' + bottomPad + 'px)'; // 恢复落地对齐
					setAnim(IDLE);
					setOnce(false);
				}
				// 没拖过：交给 handleClick
			};

			// ---- 点击回应：单击随机回应；鼠标左键双击触发余额提示 ----
			// 单击延迟 220ms 执行，以便双击时取消第一次单击的回应。
			const handleClick = (e) => {
				const d = dragRef.current;
				if (d.active || d.dragging || justDraggedRef.current) return; // 拖拽中/刚拖完：忽略
				lastInteractionRef.current = Date.now(); // 任何点击都重置闲置计时
				if (e.detail === 2) {
					if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
					clickTimerRef.current = null;
					triggerBalancePrompt();
					return;
				}
				if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
				clickTimerRef.current = setTimeout(() => {
					clickTimerRef.current = null;
					if (onceRef.current && animRef.current !== IDLE) return; // 正在播一次性动画：不打断
					stopMove(); // 点击打断移动
					showPetPrompt(pick(CLICK_LINES), 5000); // 随机点击台词
					setOnce(true);
					setAnim(pick(CLICKS)); // 随机一个点击回应动画
				}, 220);
			};

			// ============================================================================
			// 渲染
			// ============================================================================
			// 落地对齐：视频是 640×360 画布、脚在 y=330，脚底距画布底 30px（8.33%）。
			// 舞台是 16:9（高 = size×9/16），脚底距舞台底 = 舞台高 × 8.33%；
			// bottomPad 就是把这个距离下移，让"脚"正好落在视口底线上。
			const bottomPad = (size * 9 / 16 * (CANVAS_H - FEET_Y)) / CANVAS_H;
			// 舞台样式：拖拽中无偏移；平时 translateY(bottomPad) 落地
			const stageStyle = dragging
				? { transform: 'none' }
				: { transform: 'translateY(' + bottomPad + 'px)' };

			// 根容器样式：有自定义位置（拖过/走过）就按"相对窗口比例 × 当前窗口尺寸"定位；
			// 否则不设（走 CSS 的 data-corner 默认角落，天然响应式）。
			// resize 后重渲染会用新尺寸重算 → 宠物保持相对位置；
			// 同时钳制到窗口内，防止窗口缩小到宠物放不下时跑出屏幕。
			const rootStyle = customPos
				? (() => {
					const rx = customPos.rx;
					const ry = customPos.ry;
					const left = Math.min(Math.max(rx * window.innerWidth - halfW, 0), window.innerWidth - size);
					const top = Math.min(Math.max(ry * window.innerHeight - halfH, 0), window.innerHeight - size * 9 / 16);
					return { left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto' };
				})()
				: {};

			// 两个 video 共用的 props（纯播放属性，交互交给命中层）
			const commonVideoProps = {
				muted: true,
				playsInline: true,
				autoPlay: true,
				title: 'dsh-pet-update',
			};
			// 命中层 props：覆盖 HIT_BOX 区域，承载全部交互事件与抓取光标。
			// 命中层内必然命中人物，光标固定 grab（拖拽中 .dragging 类显示 grabbing）。
			const hitProps = {
				className: 'dsh-pet-hit',
				style: {
					left: (HIT_BOX.x0 / 640 * 100) + '%',
					top: (HIT_BOX.y0 / 360 * 100) + '%',
					width: ((HIT_BOX.x1 - HIT_BOX.x0) / 640 * 100) + '%',
					height: ((HIT_BOX.y1 - HIT_BOX.y0) / 360 * 100) + '%',
				},
				onMouseEnter: (e) => { if (!dragRef.current.active) e.currentTarget.style.cursor = 'grab'; },
				onMouseLeave: (e) => { if (!dragRef.current.active) e.currentTarget.style.cursor = 'default'; },
				onClick: handleClick,
				onPointerDown: handlePointerDown,
				onPointerMove: handlePointerMove,
				onPointerUp: handlePointerUp,
				onPointerCancel: handlePointerUp,
				title: 'dsh-pet-update',
			};

			// 渲染树：root > stage > [video A, video B, 命中层]
			// A 初始带 is-front（显示），B 隐藏待命；命中层在最上层承载交互
			return h('div', {
				ref: rootRef,
				className: 'dsh-pet-root',
				'data-corner': corner,   // CSS 决定默认角落
				'data-facing': facing,   // CSS 决定是否镜像
				style: Object.assign({ '--dsh-pet-size': size + 'px' }, rootStyle),
				children: h('div', {
					ref: stageRef,
					className: 'dsh-pet-stage',
					style: stageStyle,
					children: [
						(balancePrompt || petPrompt || bubble) ? h('div', {
							className: 'dsh-pet-bubble',
							'data-mode': activityMode,
							style: (balancePrompt || petPrompt) ? { whiteSpace: 'normal' } : undefined,
							children: balancePrompt ? balancePrompt.text : (petPrompt ? petPrompt.text : bubble),
						}) : null,
						h('video', Object.assign({}, commonVideoProps, { ref: videoARef, className: 'dsh-pet-video is-front' })),
						h('video', Object.assign({}, commonVideoProps, { ref: videoBRef, className: 'dsh-pet-video' })),
						h('div', hitProps),
					],
				}),
			});
		}

		// ============================================================================
		// 插件主体（Cordis 插件三件套：name / inject / apply）
		// ============================================================================
		const name = 'pet';        // 插件行 id（与 cordis.patch.yml 一致）
		const inject = ['slots', 'sessions', 'conversationEvents', 'conversationViews']; // 槽位 + 会话活动投影所需服务

		// apply：插件被激活时调用
		function apply(ctx, config) {
			// 1. 注册私有 conversation view：把会话事件投影为 pet-activity 展示状态
			if (ctx.conversationEvents && ctx.conversationViews) {
				registerPetActivityView(ctx);
			}

			// 2. 创建当前会话活动源（卸载时清理订阅）
			const currentProvideInfo = ctx.sessions && ctx.sessions.currentProvideInfo;
			const activity = currentProvideInfo ? new PetActivitySource(currentProvideInfo) : null;
			if (typeof ctx.effect === 'function') {
				ctx.effect(() => () => {
					if (activity) activity.dispose();
				}, 'dsh-pet: activity source');
			}

			// 3. 官方"叠加式"注册模式：把宠物浮层挂到 shell.overlay 槽位。
			ctx.slots.inject('shell.overlay', function* () {
				yield ctx.slots.register({
					name: 'shell.overlay',
					id: 'pet',       // 列表槽的条目 id（唯一）
					order: 1000,     // 排序（大 = 靠后渲染）
				}, (ownerProps) => h(Pet, { ...ownerProps, config, activity }));
			});
		}

		// 导出插件三件套（Cordis Loader 需要）
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
