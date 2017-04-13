<?php
$base_proxy = 'http://www.ttss.krakow.pl/internetservice';
$method = [
	'/services/lookup/autocomplete/json' => [
		'query' => function() { return TRUE; },
	],
	'/services/lookup/stopsByCharacter' => [
		'character' => 'ctype_alnum',
	],
	'/services/passageInfo/stopPassages/stop' => [
		'stop' => 'ctype_digit',
		'mode' => function($mode) { return in_array($mode, ['arrival', 'departure']); },
	],
	'/services/tripInfo/tripPassages' => [
		'tripId' => 'ctype_digit',
		'mode' => function($mode) { return in_array($mode, ['arrival', 'departure']); },
		#'vehicleId' => 'ctype_digit',
	],
	'/geoserviceDispatcher/services/stopinfo/stopPoints' => [
		'left' => 'ctype_digit',
		'bottom' => 'ctype_digit',
		'right' => 'ctype_digit',
		'top' => 'ctype_digit',
	],
	'/geoserviceDispatcher/services/pathinfo/route' => [
		'id' => 'ctype_digit',
		'direction' => 'ctype_digit',
	],
	'/geoserviceDispatcher/services/pathinfo/vehicle' => [
		'id' => 'ctype_digit',
	],
	'/geoserviceDispatcher/services/vehicleinfo/vehicles' => [
		'lastUpdate' => 'ctype_digit',
		'positionType' => function($type) { return in_array($type, ['CORRECTED', 'NORMAL']); },
		'colorType' => function($type) { return in_array($type, ['ROUTE_BASED']); },
	],
	'/services/routeInfo/routeStops' => [
		'routeId' => 'ctype_digit',
	],
	'/services/stopInfo/stop' => [
		'stop' => 'ctype_digit',
	],
	'/services/stopInfo/stopPoint' => [
		'stopPoint' => 'ctype_digit',
	],
	'/services/passageInfo/stopPassages/stopPoint' => [
		'stopPoint' => 'ctype_digit',
		'mode' => function($mode) { return in_array($mode, ['arrival', 'departure']); },
		'startTime' => 'ctype_digit',
		'timeFrame' => 'ctype_digit',
	],
];
$rewrite = [
	'/lookup/autocomplete/json' => '/services/lookup/autocomplete/json',
	'/passageInfo/stopPassages/stop' => '/services/passageInfo/stopPassages/stop',
	'/routeInfo/routeStops' => '/services/routeInfo/routeStops',
];
$rewrite = [
	'/lookup/autocomplete/json' => '/services/lookup/autocomplete/json',
	'/passageInfo/stopPassages/stop' => '/services/passageInfo/stopPassages/stop',
	'/routeInfo/routeStops' => '/services/routeInfo/routeStops',
];

$path = $_SERVER['PATH_INFO'];

if(isset($rewrite[$path])) {
	$path = $rewrite[$path];
}

if(!isset($method[$path])) {
	header('HTTP/1.1 403 Forbidden');
	die('Forbidden');
}

$parameters = [];

foreach($method[$path] as $name => $filter) {
	if(!isset($_GET[$name])) {
		header('HTTP/1.1 403 Forbidden');
		die('Parameter '.$name.' is required');
	}
	
	if(!$filter($_GET[$name])) {
		header('HTTP/1.1 403 Forbidden');
		die('Parameter '.$name.' has invalid value');
	}
	
	$parameters[$name] = $_GET[$name];
}

$result = @file_get_contents($base_proxy . $path . '?' . http_build_query($parameters));
if(!$result OR $http_response_header[0] != 'HTTP/1.1 200 OK') {
	header('HTTP/1.1 503 Service Unavailable');
	if(isset($http_response_header[0])) {
		die($http_response_header[0]);
	} else {
		die('Unknown error');
	}
}

header('Content-Type: application/json');
echo $result;
