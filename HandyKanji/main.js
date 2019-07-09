function textNodesUnder(el) {
  var n, a=[], walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null,false);
  while(n=walk.nextNode()) a.push(n);
  return a;
}

function isKanji(c) {
	return /^[\u4e00-\u9faf]+$/.test(c);
}

function wrapKanji(el) {
	nodes = textNodesUnder(el);
	buffer = '';
	nodes.forEach(function(node) {
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
		
	});

	nodes.forEach(function(node) {
		parent = node.parentNode;
		parent.removeChild(node);
	});
	
}

function makePopup(data) {
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
			console.log(hl.tagName);
			
			if(hl.tagName == 'H4') {
				context = hl.children[0].innerText;
			}
			
			ol.childNodes.forEach(function(li) {
				if(li instanceof HTMLElement) {
					if(!(context in data[key].translations)) {
						data[key].translations[context] = [];
					}
					data[key].translations[context].push(li.innerText);				
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
					console.log(yomi);
					yomi.childNodes.forEach(function(sp) {
						if(sp instanceof HTMLElement && sp.classList.contains('Hira')) {
							console.log('got a reading');
							data[key].readings[type].push(sp.innerText);
						}						
					});
				}
			});
			
		}
		
		if(chrome.storage) {
			chrome.storage.local.set(data, function() {
				if (chrome.extension.lastError) {
					console.log('An error occurred: ' + chrome.extension.lastError.message);
				} else {
					chrome.storage.local.get(key, function(data) {
						//console.log('stored data for key ' + key);
					});
				}
			});
		} else {
			console.log('chrome.storage is unavailable');
		}
		
		makePopup(data[key]);
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
			makePopup(null);
			showPopup(span);
		} else {
			//console.log('found data for key ' + key);
			makePopup(data[key]);
			showPopup(span);
		}		
	});
	
}

function bindMouseEvents() {
	body = document.getElementsByTagName('body')[0];
	popup = document.createElement('div');
	popup.setAttribute('id', 'hk_popup');
	body.appendChild(popup);

	allkanjispans = document.querySelectorAll('span.hk_hoverable');

	Array.from(allkanjispans).forEach(function(span) {
		span.addEventListener('mouseover', function () {
			kanji = span.innerText;
			//console.log(kanji);
			
			showKanjiData(kanji, span);
		});

		span.addEventListener('mouseout', function () {
			popup = document.getElementById('hk_popup');
			popup.style.display = 'none';
		});

	});	
};

wrapKanji(document);
bindMouseEvents();

/*
key = 'test';
data = {}
data[key] = 'value';

chrome.storage.local.set(data, function(){
    chrome.storage.local.get(key, function(obj){
        console.log(JSON.stringify(obj));
        console.log(obj.myKey);
    });
});
*/