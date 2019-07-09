var obs = new MutationObserver(function(mutations) {

	//console.log(mutations);
	
	key = 'mutated';
	data = {};
	data[key] = {mutated : true};

	try {			
		chrome.storage.local.set(data, function() {
			if (chrome.extension.lastError) {
				console.log('An error occurred: ' + chrome.extension.lastError.message);
			} else {
				chrome.storage.local.get(key, function(data) {});
			}
		});
	} catch(e) {
		console.log('An exception occurred: ' + e);
	}
	
	
});

function textNodesUnder(el) {
  var n, a=[], walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null,false);
  while(n=walk.nextNode()) a.push(n);
  return a;
}

function isKanji(c) {
	return /^[\u4e00-\u9faf]+$/.test(c);
}

function wrapKanji(node) {
	parent = node.parentNode;
	text = node.nodeValue;
	newnodes = [];

	for (i=0; i<text.length; i++) {
		c = text[i];
		if (isKanji(c)) {
			if(buffer != '') {
				textNode = document.createTextNode(buffer);
				newnodes.push(textNode);
				buffer = '';
			}				
			span = document.createElement('span');
			span.setAttribute('class', 'hk_hoverable');
			span.innerText = c;
			newnodes.push(span);
		} else {
			buffer += c;
		}
	}

	if(buffer != '') {
		textNode = document.createTextNode(buffer);
		newnodes.push(textNode);
		buffer = '';
	}				

	newnodes.forEach(function(newnode) {
		parent.insertBefore(newnode, node);
	});

}

function wrapAllKanji() {
	clearMutationObserver();
	nodes = textNodesUnder(document);
	buffer = '';
	nodes.forEach(function(node) {
		wrapKanji(node);
	});

	nodes.forEach(function(node) {
		parent = node.parentNode;
		parent.removeChild(node);
	});	
	bindMutationObserver();
}

function unwrapAllKanji() {
	clearMutationObserver();
	hk_xpath = "//span[contains(@class, 'hk_hover')]";
	hks = document.evaluate(hk_xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
	
	reps = []
	
	while(hk=hks.iterateNext()) {
		text = document.createTextNode(hk.innerText);
		reps.push([hk, text]);
	}

	for(i=0; i<reps.length; i++) {
		hk = reps[i][0];
		text = reps[i][1];
		hk.parentElement.replaceChild(text, hk);
	}
	
	document.normalize();
	bindMutationObserver();
}

function initPopup() {
	body = document.getElementsByTagName('body')[0];
	popup = document.createElement('div');
	popup.setAttribute('id', 'hk_popup');
	body.appendChild(popup);	
}

function fillPopup(data) {
	clearMutationObserver();
	
	popup = document.getElementById('hk_popup');
	//console.log(JSON.stringify(data));
	
	if(data) {
		trHTML = '';
		
		for (var context in data.translations) {
			if(data.translations.hasOwnProperty(context)) {
				if(context != '_nocontext_') {
					trHTML += `<h4>${context}</h4>`;
				}
				trHTML += '<ol>';
				for (var i in data.translations[context]) {
					meaning = data.translations[context][i];
					trHTML += `<li>${meaning}</li>`;								
				}				
				trHTML += '</ol>';
			}			
		}
		
		reHTML = '<ul>';
				
		for (var type in data.readings) {
			if(data.readings.hasOwnProperty(type)) {
				reHTML += `<li><strong>${type}: </strong>`;
				for (var i in data.readings[type]) {
					reading = data.readings[type][i];
					if(i>0) {
						reHTML += ', ';
					}
					reHTML += `${reading}`;
				}				
				reHTML += '</li>';
			}
		}
		
		reHTML += '</ul>';
				
		popup.innerHTML = `<table><tbody><tr><td><span class="kanji">${data.kanji}</span></td><td>${reHTML}</td><tr><td colspan="2">${trHTML}</td></tr></tbody></table>`;		
	} else {
		popup.innerHTML = 'loading...';		
	}
	bindMutationObserver();
}

function showPopup(span) {
	popup.style.left = (span.getBoundingClientRect().right + window.scrollX).toString() + 'px';
	popup.style.top = (span.getBoundingClientRect().bottom + window.scrollY).toString() + 'px';
	popup.style.display = 'block';
}

function requestListener() {
	if (this.readyState === XMLHttpRequest.DONE && this.status === 200) {
		console.log('retrieved ' + decodeURI(this.responseURL) + ', length=' + this.responseText.length.toString());		

		dp = new DOMParser();
		doc = dp.parseFromString(this.responseText, 'text/html');

		kanji = decodeURI(this.responseURL).slice(-1);
		key = `hk_${kanji}`;
		 
		data = {};
		
		data[key] = {'status' : 'OK',
						'kanji' : kanji,
						'translations' : {},
						'readings' : {}};
		
		
		
		//sh1 = doc.getElementById('Japanese');
		//sh_xpath = "/html/body/div[@id='content']//div[@id='bodyContent']/div[@id='mw-content-text']/div[@id='mw-parser-output']/h2/span[@id='Japanese']";
		//sh2 = doc.evaluate(sh_xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
		//console.log(sh1, sh2);
		
		ja_xpath = "//h2/span[@id='Japanese']";
		ol_xpath = ja_xpath + "/following::ol";
		ul_xpath = ja_xpath + "/following::ul";
		hr_xpath = ja_xpath + "/following::hr";
		
		hr = doc.evaluate(hr_xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
		ols = doc.evaluate(ol_xpath, doc, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
		
		while(ol=ols.iterateNext()) {
			
			if(ol.parentElement.classList.contains('mw-references-wrap')) {
				break;
			}
			
			if(hr && ol.compareDocumentPosition(hr) != 4) {
				break;				
			}

			context = '_nocontext_';
			
			hl = ol.previousElementSibling.previousElementSibling;
//			console.log(hl.tagName);
			
			if(hl && hl.tagName == 'H4') {
				context = hl.children[0].innerText;
				if(context == 'References') {
					continue;
				}
			}
			
			ol.childNodes.forEach(function(li) {
				if(li instanceof HTMLElement) {
					tr = '';
					li.childNodes.forEach(function(node) {
						if(node instanceof HTMLElement && !node.classList.contains('HQToggle') && !['UL', 'DL'].includes(node.tagName)) {
							tr += node.innerText;
						} else if(node.nodeType == Node.TEXT_NODE) {
							tr += node.textContent;
						}
					});					
					
					if(/{{rfdef}}/.test(tr)) {
						return;
					}
					if(!(context in data[key].translations)) {
						data[key].translations[context] = [];
					}
					
					tr = tr.trim();
					
					if(!(data[key].translations[context].includes(tr))) {
						data[key].translations[context].push(tr);			
					}					
				}
			});
		}
		
		uls = doc.evaluate(ul_xpath, doc, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
		
		while(ul=uls.iterateNext()) {
			if(hr && ul.compareDocumentPosition(hr) != 4) {
				break;				
			}
			
			hl = ul.previousElementSibling;
			
			if(!hl || hl.tagName != 'H4' || !hl.firstElementChild || hl.firstElementChild.id != 'Readings') {
				continue;
			}
			
			ul.childNodes.forEach(function(li) {
				if(li instanceof HTMLElement) {
					type = li.firstElementChild.firstElementChild.innerText;

					if(!(type in data[key].readings)) {
						data[key].readings[type] = [];
					}
					
					yomi = li.firstElementChild.nextElementSibling;
					
					if(yomi.firstElementChild.tagName == 'MARK') {
						yomi = yomi.firstElementChild;
					}
					//console.log(yomi);
					yomi.childNodes.forEach(function(sp) {
						if(sp instanceof HTMLElement && sp.classList.contains('Hira')) {
							//console.log('got a reading');
							data[key].readings[type].push(sp.innerText);
						}						
					});
				}
			});
			
		}
		
		try {
			chrome.storage.local.set(data, function() {
				if (chrome.extension.lastError) {
					console.log('An error occurred: ' + chrome.extension.lastError.message);
				} else {
					chrome.storage.local.get(key, function(data) {
						//console.log('stored data for key ' + key);
					});
				}
			});
		} catch(e) {
			console.log('An exception occurred: ' + e);
		}
		
		fillPopup(data[key]);
	}
}

function showKanjiData(kanji, span) {
	key = `hk_${kanji}`;
	chrome.storage.local.get(key, function(data) {
		if(typeof(data[key]) === 'undefined') {
			//console.log('couldn\'t find data for key ' + key);
			//console.log(JSON.stringify(data));
			//console.log(data[key]);
			url = `https://en.wiktionary.org/wiki/${kanji}`;
			xhr = new XMLHttpRequest();
      		xhr.addEventListener('load', requestListener);
			xhr.open('GET', url);
			xhr.send();
			fillPopup(null);
			showPopup(span);
		} else {
			//console.log('found data for key ' + key);
			fillPopup(data[key]);
			showPopup(span);
		}		
	});
	
}

function initSchedule() {
	
	timerId = setTimeout(function refresh() {
		setTimeout(refresh, 5000);
		//console.log('tick');
		key = 'mutated'
		chrome.storage.local.get(key, function(data) {
			if(typeof(data[key]) === 'undefined') {
				//console.log('no mutation found');				
			} else {
				//console.log('mutation found');
				unwrapAllKanji();
				wrapAllKanji();
				bindMouseEvents();
				chrome.storage.local.remove(key, function() {});				
			}
		});
	}, 5000);
	
}

function bindMutationObserver() {
	
	ocf = { subtree: true, childList : true, characterData : true };
	
	obs.observe(document.body, ocf);
}

function clearMutationObserver() {
	obs.disconnect();
}

function bindMouseEvents() {

	allKanjiSpans = document.querySelectorAll('span.hk_hoverable');

	Array.from(allKanjiSpans).forEach(function(span) {
		span.addEventListener('mouseover', function () {
			kanji = span.innerText;
			showKanjiData(kanji, span);
		});

		span.addEventListener('mouseout', function () {
			popup = document.getElementById('hk_popup');
			popup.style.display = 'none';
		});

	});	
};

initPopup();
wrapAllKanji();
bindMutationObserver();
bindMouseEvents();
initSchedule();
