// Special directions
var special_directions = {
	'Zajezdnia Nowa Huta' : 'NH',
	'Zajezdnia Podgórze' : 'P',
};

var script_version;
var script_version_xhr;

// Check for website updates
function checkVersion() {
	if(script_version_xhr) script_version_xhr.abort();
	
	script_version_xhr = $.get(
		'version.php'
	).done(function(data) {
		if(!script_version) {
			script_version = data;
			return;
		}
		
		if(script_version != data) {
			fail(lang.error_new_version);
			location.reload(true);
		}
	});
}

function checkVersionInit() {
	checkVersion();
	setInterval(checkVersion, 3600000);
}

// Webservice-related functions
function parseVehicle(vehicleId) {
	if(!vehicleId) return false;
	if(vehicleId.substr(0, 15) != '635218529567218') {
		console.log('Unknown vehicle, vehicleId=' + vehicleId);
		return false;
	}
	
	var id = parseInt(vehicleId.substr(15)) - 736;
	var prefix;
	var type;
	var low; // low floor: 0 = no, 1 - semi, 2 - full
	
	// Single exception - old id used in one case
	if(id == 831) {
		id = 216;
	}
	
	if(101 <= id && id <= 174) {
		prefix = 'HW';
		type = 'E1';
		low = 0;
		
		if((108 <= id && id <= 113) || id == 127 || id == 131 || id == 132 || id == 134 || (137 <= id && id <= 139) || (148 <= id && id <= 150) || (153 <= id && id <= 155)) {
			prefix = 'RW';
		}
	} else if(201 <= id && id <= 293) {
		prefix = 'RZ';
		type = '105Na';
		low = 0;
		
		if(246 <= id) {
			prefix = 'HZ';
		}
		if(id == 290) {
			type = '105Nb';
		}
	} else if(301 <= id && id <= 328) {
		prefix = 'RF';
		type = 'GT8S';
		low = 0;
		
		if(id == 313 || id == 323) {
			type = 'GT8C'
			low = 1;
		}
	} else if(401 <= id && id <= 440) {
		prefix = 'HL';
		type = 'EU8N';
		low = 1;
	} else if(451 <= id && id <= 462) {
		prefix = 'HK';
		type = 'N8S-NF';
		low = 0;
		
		if((451 <= id && id <= 456) || id == 459 || id == 460 || id == 462) {
			type = 'N8C-NF';
			low = 1;
		}
	} else if(601 <= id && id <= 650) {
		prefix = 'RP';
		type = 'NGT6 (3)';
		low = 2;
		
		if(id <= 613) {
			type = 'NGT6 (1)';
		} else if (id <= 626) {
			type = 'NGT6 (2)';
		}
	} else if(801 <= id && id <= 824) {
		prefix = 'RY';
		type = 'NGT8';
		low = 2;
	} else if(id == 899) {
		prefix = 'RY';
		type = '126N';
		low = 2;
	} else if(901 <= id && id <= 936) {
		prefix = 'RG';
		type = '2014N';
		low = 2;
		
		if(915 <= id) {
			prefix = 'HG';
		}
	} else if(id === 999) {
		prefix = 'HG';
		type = '405N-Kr';
		low = 1;
	} else {
		console.log('Unknown vehicle, vehicleId=' + vehicleId + ', id=' + id);
		return false;
	}
	
	return {
		vehicleId: vehicleId,
		prefix: prefix,
		id: id,
		num: prefix + id,
		type: type,
		low: low
	};
}

function tramIdToVehicleId(tramId) {
	if(0 <= tramId && tramId <= 999) {
		var vehicleId = '0000' + (tramId + 736);
		vehicleId = vehicleId.substr(vehicleId.length - 4)
		return '635218529567218' + vehicleId;
	}
}

// Element mangling
function deleteChildren(element) {
	while(element.lastChild) element.removeChild(element.lastChild);
}

function addElementWithText(parent, element, text) {
	var elem = document.createElement(element);
	elem.appendChild(document.createTextNode(text));
	parent.appendChild(elem);
	return elem;
}

function addCellWithText(parent, text) {
	return addElementWithText(parent, 'td', text);
}

function addParaWithText(parent, text) {
	return addElementWithText(parent, 'p', text);
}

function setText(element, text) {
	deleteChildren(element);
	element.appendChild(document.createTextNode(text));
}
