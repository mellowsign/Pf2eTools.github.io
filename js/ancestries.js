"use strict";

class AncestriesPage extends BaseComponent {
	static _ascSortHeritages (hA, hB) {
		return SortUtil.ascSortLower(hA.name, hB.name)
	}

	static _fnSortHeritageFilterItems (a, b) {
		if (a.values.isAlwaysVisible) return 1;
		else if (b.values.isAlwaysVisible) return -1;
		else if (a.values.versatile) return 1;
		else if (b.values.versatile) return -1;
		else return SortUtil.listSort(a, b);
	}

	constructor () {
		super();
		this.__ancestryId = {_: 0};
		this._ancestryId = this._getProxy("ancestryId", this.__ancestryId);

		this._list = null;
		this._ixData = 0;
		this._dataList = [];
		this._lastScrollFeature = null;
		this._outlineData = {};
		this._pageFilter = new PageFilterAncestries();

		this._listHeritage = null;
		this._veHeritagesDataList = [];
		this._ixDataHeritage = 0;

		this._$divNoContent = null;
		this._$divNoHeritage = null;
		this._rng = RollerUtil.roll(1234) + 5678;

		this._activeAncestryDataFiltered = null;
		this._activeFeatDataFiltered = null;

		this._didLoadNewAnc = false;
		this._listFeat = null;
		this._ixFeatData = 0;
		this._featDataList = [];
		this._featFilter = new PageFilterFeats({
			typeFilterHidden: true,
			ancFilterHidden: true,
			archFilterHidden: true,
			classFilterHidden: true,
			skillFilterHidden: true,
			typeDeselFn: it => it === "Ancestry",
		});
		this.__featId = {_: 0};
		this._featId = this._getProxy("featId", this.__featId);
	}

	get activeAncestry () {
		if (this._activeAncestryDataFiltered) return this._activeAncestryDataFiltered;
		return this.activeAncestryRaw;
	}

	get activeAncestryRaw () {
		return this._dataList[this._ancestryId._];
	}

	get activeAncestryAllHeritages () {
		return this.activeAncestry.heritage.concat(this._veHeritagesDataList)
	}

	get activeFeat () {
		if (this._activeFeatDataFiltered) return this._activeFeatDataFiltered;
		return this.activeFeatRaw;
	}

	get activeFeatRaw () {
		return this._featDataList[this._featId._];
	}

	get filterBox () {
		return this._pageFilter.filterBox;
	}

	get featFilterBox () {
		return this._featFilter.filterBox;
	}

	async pOnLoad () {
		await ExcludeUtil.pInitialise();
		Omnisearch.addScrollTopFloat();
		const data = await DataUtil.ancestry.loadJSON();
		const feats = await DataUtil.feat.loadJSON();

		this._list = ListUtil.initList({listClass: "ancestries", isUseJquery: true, syntax: this._listSyntax});
		this._listFeat = ListUtil.initList({listClass: "feats", isUseJquery: true, syntax: this._listSyntax}, {input: "#feat-lst__search", glass: "#feat-lst__search-glass", reset: "#feat-reset"});
		ListUtil.setOptions({primaryLists: [this._list, this._listFeat]});
		SortUtil.initBtnSortHandlers($("#filtertools"), this._list);
		SortUtil.initBtnSortHandlers($("#feat-filtertools"), this._listFeat);

		await this._pageFilter.pInitFilterBox({
			$iptSearch: $(`#lst__search`),
			$wrpFormTop: $(`#filter-search-group`).title("Hotkey: f"),
			$btnReset: $(`#reset`),
		});
		await this._featFilter.pInitFilterBox({
			$iptSearch: $(`#feat-lst__search`),
			$wrpFormTop: $(`#feat-filter-search-group`),
			$btnReset: $(`#feat-reset`),
		});

		this._addData(data);
		this._addFeatsData(feats);

		BrewUtil.bind({
			filterBox: this.filterBox,
			sourceFilter: this._pageFilter.sourceFilter,
			list: this._list,
			pHandleBrew: this._pHandleBrew.bind(this),
		});

		const homebrew = await BrewUtil.pAddBrewData();
		await this._pHandleBrew(homebrew);
		await BrewUtil.pAddLocalBrewData();

		BrewUtil.makeBrewButton("manage-brew");
		await ListUtil.pLoadState();
		RollerUtil.addListRollButton(true, null, 0);
		RollerUtil.addListRollButton(true, {roll: "feat-feelinglucky", reset: "feat-reset", search: "feat-filter-search-group"}, 1);

		window.onhashchange = this._handleHashChange.bind(this);

		this._list.init();
		this._listFeat.init();

		$(`.initial-message`).text(`Select an ancestry from the list to view it here`);

		this._setAncestryFromHash(Hist.initialLoad);
		this._setFeatAncestryFilters()
		this._setFeatFromHash(Hist.initialLoad);
		this._setStateFromHash(Hist.initialLoad);

		const $btnLink = ListUtil.getOrTabRightButton(`btn-feat-link`, `list`, "a");
		$btnLink.title("View this feat on the Feats page");
		const $btnPop = ListUtil.getOrTabRightButton(`btn-popout`, `new-window`);
		Renderer.hover.bindPopoutButton($btnPop, this._featDataList, null, null, UrlUtil.PG_FEATS);
		UrlUtil.bindLinkExportButton(this.featFilterBox);

		await this._pInitAndRunRender();

		ExcludeUtil.checkShowAllExcluded(this._dataList, $(`#ancestrystats`));
		ExcludeUtil.checkShowAllExcluded(this._featDataList, $(`#featstats`));
		this._initLinkGrabbers();
		// FIXME: UrlUtil.bindLinkExportButton(this.filterBox, $(`#btn-link-export-anc`));

		Hist.initialLoad = false;

		// Finally, ensure the hash correctly matches the state
		this._setHashFromState(true);

		window.dispatchEvent(new Event("toolsLoaded"));
	}

	async _pHandleBrew (homebrew) {
		const {ancestry: rawAncestryData} = homebrew;
		const cpy = MiscUtil.copy({ancestry: rawAncestryData});

		const {isAddedAnyAncestry, isAddedAnyVeHeritage} = this._addData(cpy);

		if (isAddedAnyVeHeritage && !Hist.initialLoad) await this._pDoRender();
	}

	_addData (data) {
		let isAddedAnyAncestry = false;
		let isAddedAnyVeHeritage = false;

		if (data.ancestry && data.ancestry.length) (isAddedAnyAncestry = true) && this._addData_addAncestryData(data.ancestry)
		if (data.versatileHeritage && data.versatileHeritage.length) (isAddedAnyVeHeritage = true) && this._addData_addVeHeritageData(data.versatileHeritage)

		if (isAddedAnyAncestry || isAddedAnyVeHeritage) {
			this._list.update();
			this.filterBox.render();
			this._handleFilterChange(false);
		}

		return {isAddedAnyAncestry, isAddedAnyVeHeritage}
	}

	_addFeatsData (feats) {
		feats.feat.forEach(f => {
			const isExcluded = ExcludeUtil.isExcluded(UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_FEATS](f), "feat", f.source);
			this._featFilter.mutateAndAddToFilters(f, isExcluded)
		});
		this._featDataList.push(...feats.feat)

		const len = this._featDataList.length;
		for (; this._ixFeatData < len; this._ixFeatData++) {
			const it = this._featDataList[this._ixFeatData];
			const isExcluded = ExcludeUtil.isExcluded(UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_FEATS](it), "feat", it.source);
			this._listFeat.addItem(this.getFeatListItem(it, this._ixFeatData, isExcluded));
		}

		this._listFeat.update();
		this.featFilterBox.render();
		this._handleFeatFilterChange();
	}

	_addData_addAncestryData (ancestries) {
		ancestries.forEach(anc => {
			this._pageFilter.mutateForFilters(anc)

			const isExcluded = ExcludeUtil.isExcluded(UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ANCESTRIES](anc), "ancestry", anc.source);

			const heritageExclusions = {};
			(anc.heritage || []).forEach(h => {
				if (isExcluded) return;

				(heritageExclusions[h.source] = heritageExclusions[h.source] || {})[h.name] = heritageExclusions[h.source][h.name] || ExcludeUtil.isExcluded(UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ANCESTRIES](h), "heritage", h.source);
			});

			this._pageFilter.addToFilters(anc, isExcluded, {heritageExclusions});
		});

		ancestries.filter(anc => SourceUtil.isNonstandardSource(anc.source) || BrewUtil.hasSourceJson(anc.source))
			.forEach(anc => {
				if (anc.fluff) anc.fluff.filter(f => f.source === anc.source).forEach(f => f._isStandardSource = true);
				if (anc.heritage) anc.heritage.filter(h => h.source === anc.source).forEach(h => h._isStandardSource = true);
			});

		ancestries.filter(anc => anc.heritage).forEach(anc => anc.heritage.sort(AncestriesPage._ascSortHeritages));

		this._dataList.push(...ancestries);

		const len = this._dataList.length;
		for (; this._ixData < len; this._ixData++) {
			const it = this._dataList[this._ixData];
			const isExcluded = ExcludeUtil.isExcluded(UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ANCESTRIES](it), "ancestry", it.source);
			this._list.addItem(this.getListItem(it, this._ixData, isExcluded));
		}
	}

	_addData_addVeHeritageData (heritages) {
		this._veHeritagesDataList.push(...heritages)
		heritages.forEach(h => this._pageFilter._sourceFilter.addItem(h.source))
	}

	_initHashAndStateSync () {
		// Wipe all hooks, as we redo them for each class render
		this._resetHooks("state");
		this._resetHooksAll("state");
		this._resetHooks("ancestryId");
		// Don't reset hooksAll for ancestryId

		this._addHookAll("state", () => this._setHashFromState());
	}

	_setHashFromState (isSuppressHistory) {
		// During the initial load, force-suppress all changes
		if (isSuppressHistory === undefined) isSuppressHistory = Hist.initialLoad;

		const nxtHash = this._getHashState();
		const rawLocation = window.location.hash;
		const location = rawLocation[0] === "#" ? rawLocation.slice(1) : rawLocation;
		if (nxtHash !== location) {
			if (isSuppressHistory) Hist.replaceHistoryHash(nxtHash);
			else window.location.hash = nxtHash;
		}
	}

	_setFeatAncestryFilters () {
		let names = this._getActiveHeritages().map(it => it.name);
		names.push(...this._getActiveHeritages().map(it => it.traits).filter(Boolean).flat())
		names.push(this.activeAncestry.name);
		Object.keys(this._featFilter._ancestryFilter.getValues().Ancestries).forEach(key => {
			if (!key.startsWith("_")) this._featFilter._ancestryFilter.setValue(key, 0)
		});
		names.forEach(name => { this._featFilter._ancestryFilter.setValue(name, 1) });
		this._handleFeatFilterChange();
	}

	_handleHashChange () {
		// Parity with the implementation in hist.js
		if (Hist.isHistorySuppressed) return Hist.setSuppressHistory(false);

		this._setAncestryFromHash();
		this._setFeatAncestryFilters();
		this._setFeatFromHash();
		this._setStateFromHash();
	}

	_setAncestryFromHash (isInitialLoad) {
		const [[link], _] = Hist.getDoubleHashParts();

		let ixToLoad;

		this._didLoadNewAnc = false;

		if (link === HASH_BLANK) ixToLoad = -1;
		else {
			const listItem = Hist.getActiveListItem(link);

			if (listItem == null) ixToLoad = -1;
			else {
				const toLoad = listItem.ix;
				if (toLoad == null) ixToLoad = -1;
				else ixToLoad = listItem.ix;
			}
		}

		if (!~ixToLoad && this._list.visibleItems.length) ixToLoad = this._list.visibleItems[0].ix;

		if (~ixToLoad) {
			const target = isInitialLoad ? this.__ancestryId : this._ancestryId;
			if (target._ !== ixToLoad) {
				Hist.lastLoadedId = ixToLoad;
				const anc = this._dataList[ixToLoad];
				document.title = `${anc ? anc.name : "Ancestries"} - Pf2eTools`;
				target._ = ixToLoad;
				this._didLoadNewAnc = true;
				this._rng = RollerUtil.roll(1234) + 5678;
			}
		} else {
			// This should never occur (failed loads should pick the first list item), but attempt to handle it semi-gracefully
			$(`#ancestrystats`).empty().append(AncestriesPage._render_$getNoContent());
			JqueryUtil.doToast({content: "Could not find the ancestry to load!", type: "error"})
		}
	}

	_setFeatFromHash (isInitialLoad) {
		const [_, [link]] = Hist.getDoubleHashParts();

		let ixToLoad;

		if (link === HASH_BLANK) ixToLoad = -1;
		else if (!isInitialLoad && this._didLoadNewAnc && this._listFeat.visibleItems.length) {
			ixToLoad = this._listFeat.visibleItems[0].ix;
		} else {
			const listItem = Hist.getActiveListItem(link);

			if (listItem == null) ixToLoad = -1;
			else {
				const toLoad = listItem.ix;
				if (toLoad == null) ixToLoad = -1;
				else ixToLoad = listItem.ix;
			}
		}

		if (!~ixToLoad && this._listFeat.visibleItems.length) ixToLoad = this._listFeat.visibleItems[0].ix;

		if (~ixToLoad) {
			const target = isInitialLoad ? this.__featId : this._featId;
			if (target._ !== ixToLoad) {
				Hist.lastLoadedId = ixToLoad;
				target._ = ixToLoad;
			}
		} else {
			// This should never occur (failed loads should pick the first list item), but attempt to handle it semi-gracefully
			$(`#featstats`).empty().append(AncestriesPage._render_$getNoContent());
			JqueryUtil.doToast({content: "Could not find the feat to load!", type: "error"})
		}
	}

	_setStateFromHash (isInitialLoad) {
		let [[ancH, ...subs], [ftH, ...ftSubs]] = Hist.getDoubleHashParts();
		if (ancH === "" && !subs.length) return;
		subs = this.filterBox.setFromSubHashes(subs);
		ftSubs = this.featFilterBox.setFromSubHashes(ftSubs);

		const target = isInitialLoad ? this.__state : this._state;

		// On changing ancestry (ancestry links have no state parts), clean "feature" state
		if (!subs.length) this.__state.feature = null;

		if (this._getHashState() === subs.join(HASH_PART_SEP)) return;

		const validHLookup = {};
		this.activeAncestryAllHeritages.forEach(h => validHLookup[UrlUtil.getStateKeyHeritage(h)] = h);

		// Track any incoming sources we need to filter to enable in order to display the desired heritages
		const requiredSources = new Set();

		const seenKeys = new Set();
		subs.forEach(sub => {
			const unpacked = UrlUtil.unpackSubHash(sub);
			if (!unpacked.state) return;
			unpacked.state.map(it => {
				let [k, v] = it.split("=");
				k = k.toLowerCase();
				v = UrlUtil.mini.decompress(v);
				if (k.startsWith("h")) { // heritage selection state keys
					if (validHLookup[k]) {
						if (target[k] !== v) target[k] = v;
						requiredSources.add(validHLookup[k].source);
						seenKeys.add(k);
					}
				} else { // known classes page state keys
					const knownKey = Object.keys(AncestriesPage._DEFAULT_STATE).find(it => it.toLowerCase() === k);
					if (knownKey) {
						if (target[knownKey] !== v) target[knownKey] = v;
						seenKeys.add(knownKey);
					}
				} // else discard it
			});
		});

		Object.entries(AncestriesPage._DEFAULT_STATE).forEach(([k, v]) => {
			// If we did not have a value for it, and the current state doesn't match the default, reset it
			if (!seenKeys.has(k) && v !== target[k]) target[k] = v;
		});

		if (requiredSources.size) {
			const sourceFilterValues = this._pageFilter.sourceFilter.getValues().Source;
			if (sourceFilterValues._isActive) {
				// If the filter includes "blue" values, set our sources to be included
				if (sourceFilterValues._totals.yes > 0) {
					requiredSources.forEach(source => this._pageFilter.sourceFilter.setValue(source, 1));
				} else { // if there are only "red"s active, disable them for our sources
					requiredSources.forEach(source => {
						if (sourceFilterValues[source] !== 0) this._pageFilter.sourceFilter.setValue(source, 0);
					});
				}
			}
		}

		Object.keys(validHLookup).forEach(k => {
			if (!seenKeys.has(k) && target[k]) target[k] = false;
		});

		// Run the sync in the other direction, a loop that *should* break once the hash/state match perfectly
		if (!isInitialLoad) this._setHashFromState();
	}

	/**
	 * @param [opts] Options object.
	 * @param [opts.ancestry] Ancestry to convert to hash.
	 * @param [opts.feat] Feat to convert to hash.
	 * @param [opts.state] State to convert to hash.
	 */
	_getHashState (opts) {
		opts = opts || {};

		let fromState = opts.state || MiscUtil.copy(this.__state);
		let anc = opts.ancestry || this.activeAncestry;
		let feat = opts.feat || this.activeFeat;

		// region ancestry
		let primaryHash = anc ? UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ANCESTRIES](anc) : null;
		if (!primaryHash) {
			const firstItem = this._list.items[0];
			primaryHash = firstItem ? firstItem.values.hash : HASH_BLANK;
		}
		// endregion

		// region feats
		let featHash = anc ? UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_FEATS](feat) : null;
		if (!featHash) {
			const firstItem = this._listFeat.items[0];
			primaryHash = firstItem ? firstItem.values.hash : HASH_BLANK;
		}
		// endregion

		// region state
		const validHKeys = this.activeAncestryAllHeritages.map(sc => UrlUtil.getStateKeyHeritage(sc));
		const stateParts = Object.entries(fromState)
			.filter(([k, v]) => AncestriesPage._DEFAULT_STATE[k] !== v) // ignore any default values
			.filter(([k, v]) => !(AncestriesPage._DEFAULT_STATE[k] === undefined && !v)) // ignore any falsey values which don't have defaults
			.filter(([k]) => {
				// Filter out any junky heritages/those from other classes
				if (!k.startsWith("h")) return true;
				return validHKeys.includes(k);
			})
			.map(([k, v]) => `${k}=${UrlUtil.mini.compress(v)}`);
		const stateHash = stateParts.length ? UrlUtil.packSubHash("state", stateParts) : "";
		// endregion

		const hashPartsAnc = [
			primaryHash,
			stateHash,
		].filter(Boolean);
		const hashPartsFeat = [
			featHash,
		].filter(Boolean);
		const hashParts = [
			Hist.util.getCleanHash(hashPartsAnc.join(HASH_PART_SEP)),
			Hist.util.getCleanHash(hashPartsFeat.join(HASH_PART_SEP)),
		].filter(Boolean)
		return hashParts.join("#")
	}

	_initLinkGrabbers () {
		const $body = $(document.body);
		$body.on(`mousedown`, `.cls-main__linked-titles > td > * > .rd__h .entry-title-inner`, (evt) => evt.preventDefault());
		$body.on(`click`, `.cls-main__linked-titles > td > * > .rd__h .entry-title-inner`, async (evt) => {
			const $target = $(evt.target);

			if (evt.shiftKey) {
				await MiscUtil.pCopyTextToClipboard($target.text().replace(/\.$/, ""));
				JqueryUtil.showCopiedEffect($target);
			} else {
				const featureId = $target.closest(`tr`).attr("data-scroll-id");

				const curState = MiscUtil.copy(this.__state);
				curState.feature = featureId;
				const href = `${window.location.href.split("#")[0]}#${this._getHashState({state: curState})}`;

				await MiscUtil.pCopyTextToClipboard(href);
				JqueryUtil.showCopiedEffect($target, "Copied link!");
			}
		});
	}

	getListItem (anc, ancI, isExcluded) {
		const hash = UrlUtil.autoEncodeHash(anc);
		const source = Parser.sourceJsonToAbv(anc.source);

		const $lnk = $(`<a href="#${hash}" class="lst--border">
			<span class="bold col-8 pl-0">${anc.name}</span>
			<span class="col-4 text-center ${Parser.sourceJsonToColor(anc.source)} pr-0" title="${Parser.sourceJsonToFull(anc.source)}" ${BrewUtil.sourceJsonToStyle(anc.source)}>${source}</span>
		</a>`);

		const $ele = $$`<li class="row ${isExcluded ? "row--blacklisted" : ""}">${$lnk}</li>`;

		return new ListItem(
			ancI,
			$ele,
			anc.name,
			{
				hash,
				source,
			},
			{
				$lnk,
				entity: anc,
				uniqueId: anc.uniqueId ? anc.uniqueId : ancI,
				isExcluded,
			},
		);
	}

	getFeatListItem (feat, featI, isExcluded) {
		const hash = UrlUtil.autoEncodeHash(feat);
		const source = Parser.sourceJsonToAbv(feat.source);

		const $lnk = $(`<a href="##${hash}" class="lst--border">
			<span class="bold col-5 pl-0">${feat.name}</span>
			<span class="col-1-5 text-center">${Parser.getOrdinalForm(feat.level)}</span>
			<span class="col-4 text-center">${feat._slPrereq}</span>
			<span class="col-1-5 text-center ${Parser.sourceJsonToColor(feat.source)} pr-0" title="${Parser.sourceJsonToFull(feat.source)}" ${BrewUtil.sourceJsonToStyle(feat.source)}>${source}</span>
		</a>`);

		const $ele = $$`<li class="row ${isExcluded ? "row--blacklisted" : ""}">${$lnk}</li>`;

		return new ListItem(
			featI,
			$ele,
			feat.name,
			{
				hash,
				source,
				level: feat.level,
				prerequisites: feat._slPrereq,
			},
			{
				$lnk,
				entity: feat,
				uniqueId: feat.uniqueId ? feat.uniqueId : featI,
				isExcluded,
			},
		);
	}

	_doGenerateFilteredActiveAncestryData () {
		const f = this.filterBox.getValues();
		const cpyAnc = MiscUtil.copy(this.activeAncestryRaw);
		const walker = MiscUtil.getWalker({
			keyBlacklist: MiscUtil.GENERIC_WALKER_ENTRIES_KEY_BLACKLIST,
			isAllowDeleteObjects: true,
			isDepthFirst: true,
		});

		this._activeAncestryDataFiltered = cpyAnc
	}

	_handleFilterChange (isFilterValueChange) {
		// If the filter values changes (i.e. we're not handling an initial load), mutate the state, and trigger a
		//   re-render.
		if (isFilterValueChange) {
			this._doGenerateFilteredActiveAncestryData();
			this._pDoSynchronizedRender();
			return;
		}

		const f = this.filterBox.getValues();
		this._list.filter(item => this._pageFilter.toDisplay(f, item.data.entity, [], null));

		if (this._fnOutlineHandleFilterChange) this._fnOutlineHandleFilterChange();
		if (this._fnTableHandleFilterChange) this._fnTableHandleFilterChange(f);

		// Force-hide any heritages which are filtered out
		this._proxyAssign(
			"state",
			"_state",
			"__state",
			this.activeAncestry.heritage
				.filter(h => !this.filterBox.toDisplay(f, h.source, h._fMisc, null))
				.map(h => UrlUtil.getStateKeyHeritage(h))
				.filter(stateKey => this._state[stateKey])
				.mergeMap(stateKey => ({[stateKey]: false})),
		);
		this._updateFeatHref();
	}

	_handleFeatFilterChange () {
		const f = this.featFilterBox.getValues();
		this._listFeat.filter(item => this._featFilter.toDisplay(f, item.data.entity));
		FilterBox.selectFirstVisible(this._featDataList);
		this._updateFeatHref();
	}

	async _pInitAndRunRender () {
		this._$wrpOutline = $(`#sticky-nav`);

		// Use hookAll to allow us to reset temp hooks on the property itself
		this._addHookAll("ancestryId", async () => {
			this._doGenerateFilteredActiveAncestryData();
			await this._pDoSynchronizedRender();
		});

		this._addHookAll("featId", async () => {
			await this._pDoSynchronizedRender();
		});

		this._doGenerateFilteredActiveAncestryData();
		await this._pDoRender();
	}

	async _pDoSynchronizedRender () {
		await this._pLock("render");
		try {
			await this._pDoRender();
		} finally {
			this._unlock("render");
		}
	}

	async _pDoRender () {
		// reset all hooks in preparation for rendering
		this._initHashAndStateSync();
		this.filterBox
			.off(FilterBox.EVNT_VALCHANGE)
			.on(FilterBox.EVNT_VALCHANGE, () => this._handleFilterChange(true));

		this.featFilterBox
			.off(FilterBox.EVNT_VALCHANGE)
			.on(FilterBox.EVNT_VALCHANGE, () => this._handleFeatFilterChange());

		// region bind list updates
		const hkSetHref = () => {
			// defer this for performance
			setTimeout(() => {
				this._list.items
					.filter(it => it.data.$lnk)
					.forEach(it => {
						const href = `#${this._getHashState({ancestry: it.data.entity, feat: ""})}`;
						it.data.$lnk.attr("href", href)
					});
				this._listFeat.items
					.filter(it => it.data.$lnk)
					.forEach(it => {
						const href = `#${this._getHashState({feat: it.data.entity})}`;
						it.data.$lnk.attr("href", href)
					});
			}, 5);
		};
		this._addHook("ancestryId", "_", hkSetHref);
		this._addHook("featId", "_", hkSetHref);
		this._addHookAll("state", hkSetHref);
		hkSetHref();
		// endregion

		// region rendering
		this._render_renderSummary();
		this._render_renderAncestry();
		await this._render_pRenderHeritageTabs();
		this._render_renderFeat();
		// endregion

		// region state handling
		const hkScrollToFeature = () => {
			// `state.feature` is set by clicking links in the class feature table
			if (this._state.feature) {
				// track last scrolled, otherwise *any* further hash/state change will cause us to scroll
				if (this._lastScrollFeature === this._state.feature) return;
				this._lastScrollFeature = this._state.feature;

				const $scrollTo = $(`[data-scroll-id="${this._state.feature}"]`);
				if (!$scrollTo[0]) {
					// This should never occur, but just in case, clean up
					this._state.feature = null;
					this._lastScrollFeature = null;
				} else {
					setTimeout(() => $scrollTo[0].scrollIntoView(), 100);
				}
			}
		};
		this._addHookBase("feature", hkScrollToFeature);
		hkScrollToFeature();

		const hkDisplayFluff = () => {
			const $dispAncestryTitle = $(`#ancestry-name`);
			if (this._state.isHideFeatures) $dispAncestryTitle.toggleClass("hidden", !this._state.isShowFluff)

			$(`.pf2-fluff`).toggleClass("hidden-fluff", !this._state.isShowFluff);

			if (!this._isAnyHeritageActive() && !this._state.isHideFeatures && !this._state.isShowFluff) this._$divNoHeritage.toggleClass("hidden", false);
			else this._$divNoHeritage.toggleClass("hidden", true);

			this._$divNoContent.toggleClass("hidden", this._isAnyContentActive());
		}
		this._addHookBase("isShowFluff", hkDisplayFluff);
		MiscUtil.pDefer(hkDisplayFluff);

		const hkDisplayFeatures = () => {
			const $dispAncestryFeatures = $(`[data-feature-type="ancestry"]`);
			const $dispAncestryTitle = $(`#ancestry-name`);

			if (this._state.isHideFeatures) {
				if (this._isAnyHeritageActive()) {
					this._$wrpOutline.toggleClass("hidden", false);
					$dispAncestryFeatures.toggleClass("hidden", true);
				} else {
					$dispAncestryTitle.toggleClass("hidden", !this._state.isShowFluff)
					this._$wrpOutline.toggleClass("hidden", true);
					$dispAncestryFeatures.toggleClass("hidden", true);
				}
			} else {
				if (!this._isAnyHeritageActive()) {
					this._$divNoHeritage.toggleClass("hidden", this._state.isShowFluff)
				}
				$dispAncestryTitle.toggleClass("hidden", false)
				this._$wrpOutline.toggleClass("hidden", false);
				$dispAncestryFeatures.toggleClass("hidden", false);
			}
			if (!this._isAnyHeritageActive() && !this._state.isHideFeatures && !this._state.isShowFluff) this._$divNoHeritage.toggleClass("hidden", false);
			else this._$divNoHeritage.toggleClass("hidden", true);

			this._$divNoContent.toggleClass("hidden", this._isAnyContentActive());
		};
		this._addHookBase("isHideFeatures", hkDisplayFeatures);
		MiscUtil.pDefer(hkDisplayFeatures);

		const hkShowFeats = () => {
			const $acnWrp = $(`#ancestrystats-wrp`);
			const $featView = $(`.feat-view`);

			if (this._state.isShowFeats) {
				$acnWrp.toggleClass("hidden", true);
				$featView.toggleClass("hidden", false);
			} else {
				$acnWrp.toggleClass("hidden", false);
				$featView.toggleClass("hidden", true);
			}
		};
		this._addHookBase("isShowFeats", hkShowFeats);
		MiscUtil.pDefer(hkShowFeats);

		this.activeAncestryAllHeritages.forEach(h => {
			const stateKey = UrlUtil.getStateKeyHeritage(h);
			const hkDisplayHeritage = () => {
				const isVisible = this._state[stateKey];
				$(`[data-heritage-id="${stateKey}"]`).toggleClass("hidden", !isVisible);
			};
			this._addHookBase(stateKey, hkDisplayHeritage);
			// Check/update main feature display here, as if there are no heritages active we can hide more
			this._addHookBase(stateKey, hkDisplayFeatures);
			MiscUtil.pDefer(hkDisplayHeritage);
		});
		// endregion

		this._handleFilterChange(false);
		this._handleFeatFilterChange();
	}

	_isAnyHeritageActive () {
		return !!this._getActiveHeritages().length;
	}

	_isAnyNonVeHeritageActive () {
		return !!this._getActiveHeritages().filter(h => !h.versatile).length
	}

	_isAnyVeHeritageActive () {
		return !!this._getActiveHeritages().filter(h => h.versatile).length
	}

	_isAnyContentActive () {
		return this._isAnyHeritageActive() || !this._state.isHideFeatures || this._state.isShowFluff;
	}

	_getActiveHeritages (asStateKeys) {
		return this.activeAncestryAllHeritages
			.filter(h => this._state[UrlUtil.getStateKeyHeritage(h)])
			.map(h => asStateKeys ? UrlUtil.getStateKeyHeritage(h) : h);
	}

	_render_renderSummary () {
		const $summaryText = $(`#ancestry-summary__text`).empty();
		const $summaryImage = $(`#ancestry-summary__image`).empty();
		const anc = this.activeAncestry;
		const renderer = Renderer.get();
		if (anc.summary == null) anc.summary = {};

		$$`<p class="pf2-h1">${anc.name}</p>
			${anc.summary.text ? `<p class="pf2-h1-flavor">${anc.summary.text}</p>` : ""}
			${renderer._getPf2ChapterSwirl()}
			<p class="pf2-h3 mt-4">Ability Boosts</p>
			<p class="pf2-p">${anc.boosts ? anc.boosts.join(", ") : "None"}</p>
			<p class="pf2-h3">Ability Flaw${anc.flaw && anc.flaw.length !== 1 ? "s" : ""}</p>
			<p class="pf2-p">${anc.flaw ? anc.flaw.join(", ") : "None"}</p>
			<p class="pf2-h4">Source</p>
			<p class="pf2-p">${anc.source != null ? `${Parser.sourceJsonToFull(anc.source)}${anc.page != null ? `, page ${anc.page}.` : ""}` : ""}</p>`.appendTo($summaryText);

		if (anc.summary.images && anc.summary.images.length) {
			$summaryImage.removeClass("pf2-summary__image--no-image");
			const src = anc.summary.images[this._rng % anc.summary.images.length];
			$$`<img src="${src}" alt="No Image License. Sad!">`.appendTo($summaryImage);
		} else {
			$summaryImage.addClass("pf2-summary__image--no-image");
			$$`<p>No image available.</p>`.appendTo($summaryImage);
		}
		$summaryText.show();
		$summaryImage.show();
	}

	_render_renderAncestry () {
		const $ancestryStats = $(`#ancestrystats`).empty();
		const anc = this.activeAncestry;

		const renderer = Renderer.get().resetHeaderIndex().setFirstSection(false);

		const statSidebar = {
			type: "pf2-sidebar",
			entries: [
				{
					type: "pf2-title",
					name: "Hit Points",
				},
				`${anc.hp}`,
				{
					type: "pf2-title",
					name: "Size",
				},
				`${anc.size}`,
				{
					type: "pf2-title",
					name: "Speed",
				},
				...Parser.speedToFullMap(anc.speed),
			],
		};
		if (anc.rarity) statSidebar.entries.unshift({type: "pf2-title", name: "Rarity"}, anc.rarity);
		if (anc.boosts) statSidebar.entries.push({type: "pf2-title", name: "Ability Boosts"}, ...anc.boosts);
		if (anc.flaw) statSidebar.entries.push({type: "pf2-title", name: "Ability Flaw"}, ...anc.flaw);
		if (anc.languages) statSidebar.entries.push({type: "pf2-title", name: "Languages"}, ...anc.languages);
		if (anc.traits) statSidebar.entries.push({type: "pf2-title", name: "Traits"}, ...anc.traits);
		if (anc.feature) statSidebar.entries.push({type: "pf2-title", name: anc.feature.name}, ...anc.feature.entries);
		if (anc.features) anc.features.forEach(f => statSidebar.entries.push({type: "pf2-title", name: f.name}, ...f.entries));
		const ancestryName = {
			type: "pf2-h1",
			name: anc.name,
		};
		const flavor = {
			type: "pf2-h1-flavor",
			entries: anc.flavor,
		};
		const heritageTitle = {type: "pf2-h2", name: `${anc.name} Heritages`};
		const veHeritageTitle = {type: "pf2-h2", name: `Versatile Heritages`};
		const fluffStack = [""];
		const titleStack = [""];
		renderer.recursiveRender(anc.info, fluffStack, {prefix: "<p class=\"pf2-p\">", suffix: "</p>"});
		renderer.recursiveRender(anc.heritageInfo, titleStack, {prefix: "<p class=\"pf2-p\">", suffix: "</p>"})

		$$`<div id="ancestry-name">${renderer.render(ancestryName)}</div>
		<div class="pf2-fluff">${renderer.render(flavor)}</div>
		<div data-feature-type="ancestry">${renderer.render(statSidebar)}</div>
		<div class="pf2-fluff">${fluffStack.join("")}</div>
		<div class="heritage-title">${renderer.render(heritageTitle)}${titleStack.join("")}</div>
		${anc.heritage.map(h => this._render_renderHeritageStats(h)).join("")}
		<div class="veheritage-title">${renderer.render(veHeritageTitle)}</div>
		${this._veHeritagesDataList.map(h => this._render_renderHeritageStats(h)).join("")}
		${this.activeAncestryAllHeritages.map(h => this._render_renderHeritageFluff(h)).join("")}
		`.appendTo($ancestryStats);

		this._$divNoContent = AncestriesPage._render_$getNoContent().appendTo($ancestryStats);
		this._$divNoHeritage = AncestriesPage._render_$getNoHeritage().appendTo($ancestryStats);

		$ancestryStats.show()
	}

	_render_renderHeritageStats (heritage) {
		const renderer = Renderer.get().setFirstSection(false);
		const renderStack = [""]
		renderStack.push(`<div data-heritage-id="${UrlUtil.getStateKeyHeritage(heritage)}">`)
		renderer.recursiveRender({type: "pf2-h3", name: heritage.name, entries: heritage.entries}, renderStack)
		renderStack.push(`</div>`)
		return renderStack.join("")
	}

	_render_renderHeritageFluff (heritage) {
		const renderer = Renderer.get().setFirstSection(false);
		const renderStack = [""]
		renderStack.push(`<div class="pf2-fluff" data-heritage-id="${UrlUtil.getStateKeyHeritage(heritage)}">`)
		renderer.recursiveRender(heritage.info, renderStack)
		renderStack.push(`</div>`)
		return renderStack.join("")
	}

	async _render_pRenderHeritageTabs () {
		const $wrp = $(`#heritagetabs`).empty();

		this._render_renderHeritagePrimaryControls($wrp);
		await this._render_pInitHeritageControls($wrp);
	}

	_render_renderHeritagePrimaryControls ($wrp) {
		const anc = this.activeAncestry;

		// region features/fluff
		const $btnToggleFeatures = ComponentUiUtil.$getBtnBool(this, "isHideFeatures", {
			text: "Features",
			isInverted: true,
		}).title("Toggle Ancestry Features");

		const $btnToggleFluff = ComponentUiUtil.$getBtnBool(this, "isShowFluff", {text: "Info"}).title("Toggle Ancestry Info");

		const $btnToggleFeats = ComponentUiUtil.$getBtnBool(this, "isShowFeats", {
			text: "Show Feats",
			activeClass: "btn-danger",
			activeText: "Hide Feats",
			inactiveText: "Show Feats",
		}).title("Toggle Feat View");

		$$`<div class="flex-v-center m-1 btn-group mr-3 no-shrink">${$btnToggleFeats}</div>
		<div class="flex-v-center m-1 btn-group mr-3 no-shrink">${$btnToggleFeatures}${$btnToggleFluff}</div>`.appendTo($wrp);
		// endregion

		// region heritages
		const $wrpHTabs = $(`<div class="flex-v-center flex-wrap mr-2 w-100"/>`).appendTo($wrp);
		this._listHeritage = new List({
			$wrpList: $wrpHTabs,
			isUseJquery: true,
			fnSort: AncestriesPage._fnSortHeritageFilterItems,
		});
		const allHeritages = this.activeAncestryAllHeritages

		this._ixDataHeritage = 0;
		for (; this._ixDataHeritage < allHeritages.length; ++this._ixDataHeritage) {
			const h = allHeritages[this._ixDataHeritage];
			const listItem = this._render_getHeritageTab(anc, h, this._ixDataHeritage);
			if (!listItem) continue;
			this._listHeritage.addItem(listItem);
		}

		const $dispCount = $(`<div class="text-muted m-1 cls-tabs__sc-not-shown flex-vh-center"/>`);
		this._listHeritage.addItem(new ListItem(
			-1,
			$dispCount,
			null,
			{isAlwaysVisible: true},
		));

		this._listHeritage.on("updated", () => {
			$dispCount.off("click");
			if (this._listHeritage.visibleItems.length) {
				const cntNotShown = this._listHeritage.items.length - this._listHeritage.visibleItems.length;
				$dispCount.html(cntNotShown ? `<i class="clickable" title="Adjust your filters to see more.">(${cntNotShown} more not shown)</i>` : "").click(() => this._doSelectAllHeritages());
			} else if (this._listHeritage.items.length > 1) {
				$dispCount.html(`<i class="clickable" title="Adjust your filters to see more.">(${this._listHeritage.items.length - 1} heritages not shown)</i>`).click(() => this._doSelectAllHeritages());
			} else $dispCount.html("");
		});

		this._listHeritage.init();
		// endregion
	}

	_doSelectAllHeritages () {
		const allStateKeys = this.activeAncestryAllHeritages.map(h => UrlUtil.getStateKeyHeritage(h));

		this._pageFilter.sourceFilter.doSetPillsClear();
		this.filterBox.fireChangeEvent();
		this._proxyAssign("state", "_state", "__state", allStateKeys.mergeMap(stateKey => ({[stateKey]: true})));
	}

	async _render_pInitHeritageControls ($wrp) {
		const $btnSelAll = $(`<button class="btn btn-xs btn-default" title="Select All"><span class="glyphicon glyphicon-check"/></button>`)
			.click(evt => {
				const allStateKeys = this.activeAncestryAllHeritages.map(h => UrlUtil.getStateKeyHeritage(h));
				// TODO:
				if (evt.shiftKey) {
					this._doSelectAllHeritages();
				} else if (evt.ctrlKey || evt.metaKey) {
					const nxtState = {};
					allStateKeys.forEach(k => nxtState[k] = false);
					this._listHeritage.visibleItems
						.filter(it => it.values.mod === "brew" || it.values.mod === "fresh")
						.map(it => it.values.stateKey)
						.forEach(stateKey => nxtState[stateKey] = true);
					this._proxyAssign("state", "_state", "__state", nxtState);
				} else {
					const nxtState = {};
					allStateKeys.forEach(k => nxtState[k] = false);
					this._listHeritage.visibleItems
						.map(it => it.values.stateKey)
						.filter(Boolean)
						.forEach(stateKey => nxtState[stateKey] = true);
					this._proxyAssign("state", "_state", "__state", nxtState);
				}
			});

		// TODO: Option for Homebrew/Official filter?
		const filterSets = [
			{name: "View All", subHashes: ["flstother%20options:isshowveheritages=b1~isshowstdheritages=b1"], isClearSources: false},
			{name: "Standard Heritages Only", subHashes: ["flstother%20options:isshowveheritages=b0~isshowstdheritages=b1"], isClearSources: false},
			{name: "Versatile Heritages Only", subHashes: ["flstother%20options:isshowveheritages=b1~isshowstdheritages=b0"], isClearSources: false},
		];
		const setFilterSet = ix => {
			const filterSet = filterSets[ix];
			const boxSubhashes = this.filterBox.getBoxSubHashes() || [];

			const cpySubHashes = MiscUtil.copy(filterSet.subHashes);
			if (filterSet.isClearSources) {
				const classifiedSources = this._pageFilter.sourceFilter.getSources();
				const sourcePart = [...classifiedSources.official, ...classifiedSources.homebrew]
					.map(src => `${src.toUrlified()}=0`)
					.join(HASH_SUB_LIST_SEP);
				cpySubHashes.push(`flstsource:${sourcePart}`)
			}

			this.filterBox.setFromSubHashes([
				...boxSubhashes,
				...cpySubHashes,
				`flopsource:extend`,
			].filter(Boolean), true);
			$selFilterPreset.val("-1");
		};
		const $selFilterPreset = $(`<select class="input-xs form-control cls-tabs__sel-preset"><option value="-1" disabled>Filter...</option></select>`)
			.change(() => {
				const val = Number($selFilterPreset.val());
				if (val == null) return;
				setFilterSet(val)
			});
		filterSets.forEach((it, i) => $selFilterPreset.append(`<option value="${i}">${it.name}</option>`));
		$selFilterPreset.val("-1");

		const $btnReset = $(`<button class="btn btn-xs btn-default" title="Reset Selection"><span class="glyphicon glyphicon-refresh"/></button>`)
			.click(() => {
				this._proxyAssign("state", "_state", "__state", this.activeAncestryAllHeritages.mergeMap(h => ({[UrlUtil.getStateKeyHeritage(h)]: false})));
			});

		this.filterBox.on(FilterBox.EVNT_VALCHANGE, this._handleHeritageFilterChange.bind(this));
		this._handleHeritageFilterChange();
		// Remove the temporary "hidden" class used to prevent popping
		this._listHeritage.items.forEach(it => it.ele.removeClass("hidden"));

		const $btnToggleSources = ComponentUiUtil.$getBtnBool(this, "isShowHSources", {$ele: $(`<button class="btn btn-xs btn-default flex-1" title="Show Heritage Sources"><span class="glyphicon glyphicon-book"/></button>`)});

		const $btnShuffle = $(`<button title="Feeling Lucky?" class="btn btn-xs btn-default flex-1"><span class="glyphicon glyphicon-random"/></button>`)
			.click(() => {
				if (!this._listHeritage.visibleItems.length) {
					return JqueryUtil.doToast({
						content: "No heritages to choose from!",
						type: "warning",
					});
				}

				const doDeselAll = () => this._listHeritage.items.filter(it => it.values.stateKey).forEach(it => this._state[it.values.stateKey] = false);

				const activeKeys = Object.keys(this._state).filter(it => it.startsWith("sub"));
				const visibleActiveKeys = this._listHeritage.visibleItems.filter(it => it.values.stateKey).map(it => it.values.stateKey).filter(it => activeKeys.includes(it));

				// Avoid re-selecting the same option if there's only one selected
				if (visibleActiveKeys.length === 1) {
					doDeselAll();
					const options = this._listHeritage.visibleItems.filter(it => it.values.stateKey).map(it => it.values.stateKey).filter(it => it.values.stateKey !== visibleActiveKeys[0]);
					this._state[RollerUtil.rollOnArray(options)] = true;
				} else {
					doDeselAll();
					const it = RollerUtil.rollOnArray(this._listHeritage.visibleItems.filter(it => it.values.stateKey));
					this._state[it.values.stateKey] = true;
				}
			});

		$$`<div class="flex-v-center m-1 no-shrink">${$selFilterPreset}</div>`.appendTo($wrp);
		$$`<div class="flex-v-center m-1 btn-group no-shrink">
			${$btnSelAll}${$btnShuffle}${$btnReset}${$btnToggleSources}
		</div>`.appendTo($wrp);
	}

	_handleHeritageFilterChange () {
		const f = this.filterBox.getValues();
		const anc = this.activeAncestry;
		this._listHeritage.filter(li => {
			if (li.values.isAlwaysVisible) return true;
			if (li.values.versatile && !this.filterBox.getValues()[this._pageFilter.optionsFilter.header].isShowVeHeritages) return false;
			if (!li.values.versatile && !this.filterBox.getValues()[this._pageFilter.optionsFilter.header].isShowStdHeritages) return false;
			return this.filterBox.toDisplay(
				f,
				li.data.entity.source,
				anc.boosts || [],
				anc.flaw || [],
				anc.hp,
				anc.size,
				anc._fspeed,
				anc._fspeedtypes,
				anc._flanguages,
				anc.traits,
				anc._fMisc,
			);
		});
	}

	_render_getHeritageTab (anc, h, ix) {
		const isExcluded = ExcludeUtil.isExcluded(UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ANCESTRIES](h), "heritage", h.source);

		const stateKey = UrlUtil.getStateKeyHeritage(h);
		const mod = AncestriesPage.getHeritageCssMod(anc, h);
		const clsActive = `cls__btn-sc--active-${mod}`;

		if (this._state[stateKey] == null) this._state[stateKey] = false;

		const $dispName = $(`<div title="${h.name.toTitleCase()}; Source: ${h.source}"/>`);
		const $dispSource = $(`<div class="ml-1" title="${Parser.sourceJsonToFull(h.source)}">(${Parser.sourceJsonToAbv(h.source)})</div>`);
		const hkSourcesVisible = () => {
			$dispName.text(h.name);
			$dispSource.toggleClass("hidden", !this._state.isShowHSources);
		};
		this._addHookBase("isShowHSources", hkSourcesVisible);
		MiscUtil.pDefer(hkSourcesVisible);

		// Initially have these "hidden," to prevent them popping out when we filter them
		const $btn = $$`<button class="btn btn-default btn-xs flex-v-center m-1 hidden ${h.isReprinted ? "cls__btn-sc--reprinted" : ""}">
				${$dispName}
				${$dispSource}
			</button>`
			.click(() => this._state[stateKey] = !this._state[stateKey])
			.contextmenu(evt => {
				evt.preventDefault();
				this._state[stateKey] = !this._state[stateKey];
			});
		const hkVisible = () => {
			$(".heritage-title").toggleClass("hidden", !this._isAnyNonVeHeritageActive())
			$(".veheritage-title").toggleClass("hidden", !this._isAnyVeHeritageActive())
			$btn.toggleClass(clsActive, !!this._state[stateKey]);
		};
		this._addHookBase(stateKey, hkVisible);
		MiscUtil.pDefer(hkVisible);

		return new ListItem(
			ix,
			$btn,
			h.name,
			{
				source: h.source,
				versatile: !!h.versatile,
				stateKey,
				mod,
			},
			{
				isExcluded,
				entity: h,
				uniqueId: h.uniqueId ? h.uniqueId : ix,
			},
		);
	}

	static getHeritageCssMod (anc, h) {
		if (h.versatile) return "spicy";
		if (h.source !== anc.source) {
			return BrewUtil.hasSourceJson(h.source)
				? "brew"
				: SourceUtil.isNonstandardSource(h.source)
					? h.isReprinted ? "stale" : "spicy"
					: h.isReprinted ? "reprinted" : "fresh";
		}
		return "fresh";
	}

	_render_renderFeat () {
		const $featStats = $(`#featstats`).empty();
		const feat = this.activeFeat;
		RenderFeats.$getRenderedFeat(feat).appendTo($featStats);
		$featStats.show();
		this._updateFeatHref();
	}

	_updateFeatHref () {
		const feat = this.activeFeat;
		if (!feat) return;
		$(`#btn-feat-link`).attr("href", `feats.html#${UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_FEATS](feat)}${HASH_PART_SEP}${this.featFilterBox.getSubHashes().join(HASH_PART_SEP)}`);
	}

	static _render_$getNoContent () {
		return $(`<div class="pf2-h1-flavor text-center">Toggle a button to view ancestry and heritage information.</div>`)
	}

	static _render_$getNoHeritage () {
		return $(`<div class="pf2-h1-flavor text-center" style="clear: none; position: absolute; width: 100%">Select Heritages to display them here.</div>`)
	}

	_getDefaultState () {
		return MiscUtil.copy(AncestriesPage._DEFAULT_STATE);
	}
}

AncestriesPage._DEFAULT_STATE = {
	isHideFeatures: false,
	isShowFluff: true,
	isShowVeHeritages: false,
	isShowHSources: false,
	isShowFeats: false,
};

let ancestriesPage;
window.addEventListener("load", async () => {
	await Renderer.trait.preloadTraits();
	ancestriesPage = new AncestriesPage();
	ancestriesPage.pOnLoad()
});
