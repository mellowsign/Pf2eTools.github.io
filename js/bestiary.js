"use strict";

const ECGEN_BASE_PLAYERS = 4; // assume a party size of four

class BestiaryPage extends ListPage {
	constructor () {
		super({
			pageFilter: new PageFilterBestiary(),
			sublistClass: "subcreatures",
			dataProp: ["creature"],
		});
		this._multiSource = new MultiSource({
			fnHandleData: this._addCreatures.bind(this),
			prop: "creature",
		});

		this._addedHashes = new Set();

		this._$totalCr = null;
		this._lastRendered = {creature: null, isScaled: false};
		this._printBookView = null;
	}

	getListItem (cr, mI) {
		const hash = UrlUtil.autoEncodeHash(cr);
		if (!cr.uniqueId && this._addedHashes.has(hash)) return null;
		this._addedHashes.add(hash);

		const isExcluded = ExcludeUtil.isExcluded(hash, "creature", cr.source);

		this._pageFilter.mutateAndAddToFilters(cr, isExcluded);

		const eleLi = document.createElement("li");
		eleLi.className = `row ${isExcluded ? "row--blacklisted" : ""}`;
		eleLi.addEventListener("click", (evt) => this._handleBestiaryLiClick(evt, listItem));
		eleLi.addEventListener("contextmenu", (evt) => this._handleBestiaryLiContext(evt, listItem));

		const source = Parser.sourceJsonToAbv(cr.source);
		const type = cr.creatureType && cr.creatureType.length ? cr.creatureType.join(", ") : "\u2014";
		const level = cr.level;

		eleLi.innerHTML += `<a href="#${hash}" class="lst--border">
			${EncounterBuilder.getButtons(mI)}
			<span class="ecgen__name bold col-4-2 pl-0">${cr.name}</span>
			<span class="type col-4-1">${type}</span>
			<span class="col-1-7 text-center">${level}</span>
			<span title="${Parser.sourceJsonToFull(cr.source)}" class="col-2 text-center ${Parser.sourceJsonToColor(cr.source)} pr-0" ${BrewUtil.sourceJsonToStyle(cr.source)}>${source}</span>
		</a>`;
		eleLi.firstElementChild.addEventListener("click", evt => this._handleBestiaryLinkClick(evt));

		const listItem = new ListItem(
			mI,
			eleLi,
			cr.name,
			{
				hash,
				source,
				level: cr.level,
				type: cr.creatureType,
			},
			{
				uniqueId: cr.uniqueId ? cr.uniqueId : mI,
				isExcluded,
			},
		);

		return listItem;
	}

	handleFilterChange () {
		if (Hist.initialLoad) return;

		const f = this._pageFilter.filterBox.getValues();
		this._list.filter(li => {
			const c = this._dataList[li.ix];
			return this._pageFilter.toDisplay(f, c);
		});
		MultiSource.onFilterChangeMulti(this._dataList);
		encounterBuilder.resetCache();
	}

	async pGetSublistItem (crRaw, pinId, addCount, data = {}) {
		const cr = await (data.scaled ? ScaleCreature.scale(crRaw, data.scaled) : crRaw);
		const subHash = data.scaled ? `${HASH_PART_SEP}${VeCt.HASH_CR_SCALED}${HASH_SUB_KV_SEP}${data.scaled}` : "";

		const name = cr._displayName || cr.name;
		const hash = `${UrlUtil.autoEncodeHash(cr)}${subHash}`;
		const type = cr.creatureType && cr.creatureType.length ? cr.creatureType.join(", ") : "\u2014";
		const count = addCount || 1;
		const level = cr.level;

		const $hovStatblock = $(`<span class="col-1-9 text-center help--hover ecgen__visible">Statblock</span>`)
			.mouseover(evt => EncounterBuilder.doStatblockMouseOver(evt, $hovStatblock[0], pinId, cr._isScaledLvl))
			.mousemove(evt => Renderer.hover.handleLinkMouseMove(evt, $hovStatblock[0]))
			.mouseleave(evt => Renderer.hover.handleLinkMouseLeave(evt, $hovStatblock[0]));

		const $hovImage = $(`<span class="col-1-9 text-center ecgen__visible help--hover">Image</span>`)
			.mouseover(evt => EncounterBuilder.handleImageMouseOver(evt, $hovImage, pinId));

		const $ptCr = (() => {
			if (level === "Unknown") return $(`<span class="col-1-2 text-center">${level}</span>`);

			const $iptLvl = $(`<input value="${level}" class="ecgen__cr_input form-control form-control--minimal input-xs">`)
				.click(() => $iptLvl.select())
				.change(() => encounterBuilder.pDoLvlChange($iptLvl, pinId, cr._isScaledLvl));

			return $$`<span class="col-1-2 text-center">${$iptLvl}</span>`;
		})();

		const $eleCount1 = $(`<span class="col-2 text-center">${count}</span>`);
		const $eleCount2 = $(`<span class="col-2 pr-0 text-center">${count}</span>`);

		const $ele = $$`<li class="row row--bestiary_sublist">
			<a href="#${hash}" draggable="false" class="ecgen__hidden lst--border">
				<span class="bold col-5 pl-0">${name}</span>
				<span class="col-3-8">${type}</span>
				<span class="col-1-2 text-center">${level}</span>
				${$eleCount1}
			</a>

			<div class="lst__wrp-cells ecgen__visible--flex lst--border">
				${EncounterBuilder.$getSublistButtons(pinId, getCreatureCustomHashId(cr))}
				<span class="ecgen__name--sub col-3-5">${name}</span>
				${$hovStatblock}
				${$hovImage}
				${$ptCr}
				${$eleCount2}
			</div>
		</li>`
			.contextmenu(evt => ListUtil.openSubContextMenu(evt, listItem));

		const listItem = new ListItem(
			pinId,
			$ele,
			name,
			{
				hash,
				source: Parser.sourceJsonToAbv(cr.source),
				type,
				level,
				count,
			},
			{
				uniqueId: data.uniqueId || "",
				customHashId: getCreatureCustomHashId(cr),
				$elesCount: [$eleCount1, $eleCount2],
			},
		);

		return listItem;
	}

	doLoadHash (id) {
		const cr = this._dataList[id];

		this._renderStatblock(cr);

		loadSubHash([]);
		ListUtil.updateSelected();
	}

	async pDoLoadSubHash (sub) {
		sub = this._pageFilter.filterBox.setFromSubHashes(sub);
		await ListUtil.pSetFromSubHashes(sub, pPreloadSublistSources);

		await this._printBookView.pHandleSub(sub);

		const scaledHash = sub.find(it => it.startsWith(VeCt.HASH_CR_SCALED));
		if (scaledHash) {
			const scaleTo = Number(UrlUtil.unpackSubHash(scaledHash)[VeCt.HASH_CR_SCALED][0]);
			const cr = this._dataList[Hist.lastLoadedId];
			if (Parser.isValidCreatureLvl(scaleTo) && scaleTo !== this._lastRendered.creature.level) {
				ScaleCreature.scale(cr, scaleTo).then(scaled => this._renderStatblock(scaled, true));
			}
		}

		encounterBuilder.handleSubhash(sub);
	}

	async pOnLoad () {
		window.loadHash = this.doLoadHash.bind(this);
		window.loadSubHash = this.pDoLoadSubHash.bind(this);

		await this._pageFilter.pInitFilterBox({
			$iptSearch: $(`#lst__search`),
			$wrpFormTop: $(`#filter-search-group`).title("Hotkey: f"),
			$btnReset: $(`#reset`),
		});

		encounterBuilder = new EncounterBuilder();
		encounterBuilder.initUi();
		await ExcludeUtil.pInitialise();
		// TODO: Homebrew functionality
		const creatureAbilities = await DataUtil.loadJSON("data/abilities.json");
		Renderer.hover._pCacheAndGet_populate(UrlUtil.PG_ABILITIES, creatureAbilities, "ability");
		await this._multiSource.pMultisourceLoad(
			"data/bestiary/",
			this._pageFilter.filterBox,
			this._pPageInit.bind(this),
			this._addCreatures.bind(this),
			this._pPostLoad.bind(this));
		if (Hist.lastLoadedId == null) Hist._freshLoad();
		ExcludeUtil.checkShowAllExcluded(this._dataList, $(`#pagecontent`));
		this.handleFilterChange();
		await encounterBuilder.initState();
		window.dispatchEvent(new Event("toolsLoaded"));
	}

	_addCreatures (data) {
		if (!data || !data.length) return;

		this._dataList.push(...data);

		// build the table
		for (; this._ixData < this._dataList.length; this._ixData++) {
			const cr = this._dataList[this._ixData];
			const listItem = this.getListItem(cr, this._ixData);
			if (!listItem) continue;
			this._list.addItem(listItem);
		}

		this._list.update();

		this._pageFilter.filterBox.render();
		this.handleFilterChange();

		ListUtil.setOptions({
			itemList: this._dataList,
			getSublistRow: this.pGetSublistItem.bind(this),
			primaryLists: [this._list],
		});

		const $btnPop = ListUtil.getOrTabRightButton(`btn-popout`, `new-window`);
		Renderer.hover.bindPopoutButton($btnPop, this._dataList, this._popoutHandlerGenerator.bind(this), "Popout Window (SHIFT for Source Data)");
		UrlUtil.bindLinkExportButton(this._pageFilter.filterBox);
		ListUtil.bindOtherButtons({
			download: true,
			upload: {
				pFnPreLoad: pPreloadSublistSources,
			},
			sendToBrew: {
				mode: "creatureBuilder",
				fnGetMeta: () => ({
					page: UrlUtil.getCurrentPage(),
					source: Hist.getHashSource(),
					hash: Hist.getHashParts()[0],
				}),
			},
		});
	}

	_popoutHandlerGenerator (toList) {
		return (evt) => {
			const cr = toList[Hist.lastLoadedId];
			const toRender = this._lastRendered.creature != null && this._lastRendered.isScaled ? this._lastRendered.creature : cr;

			if (evt.shiftKey) {
				const $content = Renderer.hover.$getHoverContent_statsCode(toRender);
				Renderer.hover.getShowWindow(
					$content,
					Renderer.hover.getWindowPositionFromEvent(evt),
					{
						title: `${toRender._displayName || toRender.name} \u2014 Source Data`,
						isPermanent: true,
						isBookContent: true,
					},
				);
			} else {
				const pageUrl = `#${UrlUtil.autoEncodeHash(toRender)}${toRender._isScaledLvl ? `${HASH_PART_SEP}${VeCt.HASH_CR_SCALED}${HASH_SUB_KV_SEP}${toRender._isscaledLvl}` : ""}`;

				const renderFn = Renderer.hover._pageToRenderFn(UrlUtil.getCurrentPage());
				const $content = $$`<table class="stats">${renderFn(toRender)}</table>`;
				Renderer.hover.getShowWindow(
					$content,
					Renderer.hover.getWindowPositionFromEvent(evt),
					{
						pageUrl,
						title: toRender._displayName || toRender.name,
						isPermanent: true,
					},
				);
			}
		};
	}

	_getScaledData () {
		const last = this._lastRendered.creature;
		return {scaled: last._isScaledLvl, customHashId: getCreatureCustomHashId(last)};
	}

	_onSublistChange () {
		this._$totalCr = this._$totalCr || $(`#totalcr`);
		const crCount = ListUtil.sublist.items.map(it => it.values.count).reduce((a, b) => a + b, 0);
		this._$totalCr.html(`${crCount} creature${crCount === 1 ? "" : "s"}`);
		if (encounterBuilder.isActive()) encounterBuilder.updateDifficulty();
		else encounterBuilder.doSaveState();
	}

	async _pPageInit (loadedSources) {
		Object.keys(loadedSources)
			.map(src => new FilterItem({item: src, pFnChange: this._multiSource.pLoadSource.bind(this._multiSource)}))
			.forEach(fi => this._pageFilter.sourceFilter.addItem(fi));

		this._list = ListUtil.initList(
			{
				listClass: "creatures",
				fnSort: PageFilterBestiary.sortCreatures,
				syntax: this._listSyntax,
			},
		);
		ListUtil.setOptions({primaryLists: [this._list]});
		SortUtil.initBtnSortHandlers($(`#filtertools`), this._list);

		const $outVisibleResults = $(`.lst__wrp-search-visible`);
		this._list.on("updated", () => {
			$outVisibleResults.html(`${this._list.visibleItems.length}/${this._list.items.length}`);
		});

		// filtering function
		this._pageFilter.filterBox.on(
			FilterBox.EVNT_VALCHANGE,
			this.handleFilterChange.bind(this),
		);

		this._subList = ListUtil.initSublist({
			listClass: "subcreatures",
			fnSort: PageFilterBestiary.sortCreatures,
			onUpdate: this._onSublistChange.bind(this),
			customHashHandler: (cr, uid) => ScaleCreature.scale(cr, Number(uid.split("_").last())),
			customHashUnpacker: getUnpackedCustomHashId,
		});
		SortUtil.initBtnSortHandlers($("#sublistsort"), this._subList);

		const baseHandlerOptions = {shiftCount: 5};
		const addHandlerGenerator = () => {
			return (evt, proxyEvt) => {
				evt = proxyEvt || evt;
				if (this._lastRendered.isScaled) {
					if (evt.shiftKey) ListUtil.pDoSublistAdd(Hist.lastLoadedId, true, 5, this._getScaledData());
					else ListUtil.pDoSublistAdd(Hist.lastLoadedId, true, 1, this._getScaledData());
				} else ListUtil.genericAddButtonHandler(evt, baseHandlerOptions);
			};
		}
		const subtractHandlerGenerator = () => {
			return (evt, proxyEvt) => {
				evt = proxyEvt || evt;
				if (this._lastRendered.isScaled) {
					if (evt.shiftKey) ListUtil.pDoSublistSubtract(Hist.lastLoadedId, 5, this._getScaledData());
					else ListUtil.pDoSublistSubtract(Hist.lastLoadedId, 1, this._getScaledData());
				} else ListUtil.genericSubtractButtonHandler(evt, baseHandlerOptions);
			};
		}
		ListUtil.bindAddButton(addHandlerGenerator, baseHandlerOptions);
		ListUtil.bindSubtractButton(subtractHandlerGenerator, baseHandlerOptions);
		ListUtil.initGenericAddable();

		// region print view
		this._printBookView = new BookModeView({
			hashKey: "bookview",
			$openBtn: $(`#btn-printbook`),
			noneVisibleMsg: "If you wish to view multiple creatures, please first make a list",
			pageTitle: "Bestiary Printer View",
			popTblGetNumShown: async ($wrpContent) => {
				const toShow = await Promise.all(ListUtil.genericPinKeyMapper());

				toShow.sort((a, b) => SortUtil.ascSort(a._displayName || a.name, b._displayName || b.name));

				let numShown = 0;

				const stack = [];

				const renderCreature = (cr) => {
					stack.push(`<div class="bkmv__wrp-item"><div class="pf2-stat stats stats--book stats--bkmv">`);
					stack.push(Renderer.creature.getCompactRenderedString(cr).html());
					stack.push(`</div></div>`);
				};

				stack.push(`<div class="w-100 h-100">`);
				toShow.forEach(cr => renderCreature(cr));
				if (!toShow.length && Hist.lastLoadedId != null) {
					renderCreature(this._dataList[Hist.lastLoadedId]);
				}
				stack.push(`</div>`);

				numShown += toShow.length;
				$wrpContent.append(stack.join(""));

				return numShown;
			},
			hasPrintColumns: true,
		});
		// endregion

		return {list: this._list, subList: this._subList}
	}

	async _pPostLoad () {
		const homebrew = await BrewUtil.pAddBrewData();
		await this._addCreatures(homebrew);
		BrewUtil.bind({list: this._list, pHandleBrew: this._handleBrew.bind(this)});
		await BrewUtil.pAddLocalBrewData();
		BrewUtil.makeBrewButton("manage-brew");
		BrewUtil.bind({filterBox: this._pageFilter.filterBox, sourceFilter: this._pageFilter.sourceFilter});
		await ListUtil.pLoadState();
	}

	_handleBrew (homebrew) {
		this._addCreatures(homebrew.creature);
		return Promise.resolve();
	}

	_handleBestiaryLiClick (evt, listItem) {
		if (encounterBuilder.isActive()) Renderer.hover.doPopout(evt, this._dataList, listItem.ix);
		else this._list.doSelect(listItem, evt);
	}

	_handleBestiaryLiContext (evt, listItem) {
		if (!encounterBuilder.isActive()) ListUtil.openContextMenu(evt, this._list, listItem);
	}

	_handleBestiaryLinkClick (evt) {
		if (encounterBuilder.isActive()) evt.preventDefault();
	}

	_renderStatblock (cr, isScaled) {
		this._lastRendered.creature = cr;
		this._lastRendered.isScaled = isScaled;
		Renderer.get().setFirstSection(true);

		const $content = $("#pagecontent").empty();

		const buildStatsTab = () => {
			const $btnScaleLvl = cr.level != null ? $(`
			<button id="btn-scale-lvl" title="Scale Creature By Level (Highly Experimental)" class="mon__btn-scale-lvl btn btn-xs btn-default">
				<span class="glyphicon glyphicon-signal"/>
			</button>`)
				.off("click").click((evt) => {
					evt.stopPropagation();
					const win = (evt.view || {}).window;
					const creature = this._dataList[Hist.lastLoadedId];
					const lastLvl = this._lastRendered.creature ? this._lastRendered.creature.level : creature.level;
					Renderer.creature.getLvlScaleTarget(win, $btnScaleLvl, lastLvl, (targetLvl) => {
						if (targetLvl === creature.level) this._renderStatblock(creature);
						else Hist.setSubhash(VeCt.HASH_CR_SCALED, targetLvl);
					});
				}).toggle(cr.level !== 100) : null;

			const $btnResetScaleLvl = cr.level != null ? $(`
			<button id="btn-scale-lvl" title="Reset CR Scaling" class="mon__btn-scale-lvl btn btn-xs btn-default">
				<span class="glyphicon glyphicon-refresh"></span>
			</button>`)
				.click(() => Hist.setSubhash(VeCt.HASH_CR_SCALED, null))
				.toggle(isScaled) : null;

			$content.append(RenderBestiary.$getRenderedCreature(cr, {$btnScaleLvl, $btnResetScaleLvl}));

			$(`#wrp-pagecontent`).scroll();
		}

		const buildFluffTab = async () => {
			const pGetFluff = async () => {
				const creature = this._dataList[Hist.lastLoadedId];
				const fluff = await Renderer.creature.pGetFluff(creature);
				return fluff.entries || [];
			}
			const fluffEntries = await pGetFluff();
			const renderStack = [];
			Renderer.get().recursiveRender(fluffEntries, renderStack);
			$content.append(renderStack.join(""));
		}

		// reset tabs
		const statTab = Renderer.utils.tabButton(
			"Statblock",
			() => {
				$(`#float-token`).show();
			},
			buildStatsTab,
		);
		const fluffTab = Renderer.utils.tabButton(
			"Fluff",
			() => {},
			buildFluffTab,
		);
		Renderer.utils.bindTabButtons(statTab, fluffTab);
	}

	_getSearchCache (entity) {
		const ptrOut = {_: ""};
		Object.keys(entity).filter(it => !it.startsWith("_")).forEach(it => this._getSearchCache_handleEntryProp(entity, it, ptrOut));
		return ptrOut._;
	}
}

let encounterBuilder;
class EncounterBuilderUtils {
	static getSublistedEncounter () {
		return ListUtil.sublist.items.map(it => {
			const cr = bestiaryPage._dataList[it.ix];
			if (cr.level != null) {
				const lvlScaled = it.data.customHashId ? Number(getUnpackedCustomHashId(it.data.customHashId).scaled) : null;
				return {
					level: it.values.level,
					count: Number(it.values.count),

					// used for encounter adjuster
					lvlScaled: lvlScaled,
					customHashId: it.data.customHashId,
					hash: UrlUtil.autoEncodeHash(cr),
				}
			}
		}).filter(it => it && it.level !== 100).sort((a, b) => SortUtil.ascSort(b.level, a.level));
	}

	static calculateListEncounterXp (partyMeta) {
		return EncounterBuilderUtils.calculateEncounterXp(EncounterBuilderUtils.getSublistedEncounter(), partyMeta);
	}

	static getCreatureXP (partyMeta, creature) {
		const d = getLvl(creature) - partyMeta.partyLevel
		if (d < -4) return 0;
		else if (d === -4) return 10;
		else if (d === -3) return 15;
		else if (d === -2) return 20;
		else if (d === -1) return 30;
		else if (d === 0) return 40;
		else if (d === 1) return 60;
		else if (d === 2) return 80;
		else if (d === 3) return 120;
		else if (d === 4) return 160;
		else if (d > 4) return 160 + 2 ** (Math.floor((d - 5) / 2)) * 80;
		return 0
	}

	/**
	 * @param data an array of {lvl: n, count: m} objects
	 * @param partyMeta number of players in the party
	 */
	static calculateEncounterXp (data, partyMeta = null) {
		// Make a default, generic-sized party of level 1 players
		if (partyMeta == null) partyMeta = new EncounterPartyMeta([{level: 1, count: ECGEN_BASE_PLAYERS}])

		data = data.filter(it => getLvl(it) !== 100)
			.sort((a, b) => SortUtil.ascSort(getLvl(b), getLvl(a)));

		let XP = 0;
		let feasibleCount = 0;
		let underCount = 0;
		let overCount = 0;
		if (!data.length) return {XP, feasibleCount, overCount, underCount};

		data.forEach(it => {
			if (getLvl(it) - partyMeta.partyLevel > 4) overCount += 1;
			else if (getLvl(it) - partyMeta.partyLevel < -4) underCount += 1;
			else feasibleCount += 1;
			XP += EncounterBuilderUtils.getCreatureXP(partyMeta, it) * it.count;
		});

		return {XP, feasibleCount, overCount, underCount, meta: {partySize: partyMeta.partySize}};
	}
}

function getCustomHashId (name, source, scaledLvl) {
	return `${name}_${source}_${scaledLvl}`.toLowerCase();
}

function getCreatureCustomHashId (cr) {
	if (cr._isScaledLvl != null) return getCustomHashId(cr.name, cr.source, cr._isScaledLvl);
	return null;
}

async function pPreloadSublistSources (json) {
	if (json.l && json.l.items && json.l.sources) { // if it's an encounter file
		json.items = json.l.items;
		json.sources = json.l.sources;
	}
	const loaded = Object.keys(bestiaryPage._multiSource.loadedSources)
		.filter(it => bestiaryPage._multiSource.loadedSources[it].loaded);
	const lowerSources = json.sources.map(it => it.toLowerCase());
	const toLoad = Object.keys(bestiaryPage._multiSource.loadedSources)
		.filter(it => !loaded.includes(it))
		.filter(it => lowerSources.includes(it.toLowerCase()));
	const loadTotal = toLoad.length;
	if (loadTotal) {
		await Promise.all(toLoad.map(src => bestiaryPage._multiSource.pLoadSource(src, "yes")));
	}
}

async function pHandleUnknownHash (link, sub) {
	const src = Object.keys(bestiaryPage._multiSource.loadedSources)
		.find(src => src.toLowerCase() === decodeURIComponent(link.split(HASH_LIST_SEP)[1]).toLowerCase());
	if (src) {
		await bestiaryPage._multiSource.pLoadSource(src, "yes");
		Hist.hashChange();
	}
}

function getUnpackedCustomHashId (customHashId) {
	return {scaled: Number(customHashId.split("_").last()), customHashId};
}

function getLvl (obj) {
	if (obj.lvlScaled != null) return obj.lvlScaled;
	return Number(obj.level) || null;
}

let bestiaryPage;
window.addEventListener("load", async () => {
	await Renderer.trait.preloadTraits();
	bestiaryPage = new BestiaryPage();
	bestiaryPage.pOnLoad()
});
