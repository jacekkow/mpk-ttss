<?php
if(!isset($base_proxy)) {
	echo 'This script is for inclusion only.';
	die();
}

function is_number($str) {
	$str = (string)$str;

	return
		ctype_digit($str)
		OR
		(
			substr($str, 0, 1) == '-'
			AND
			ctype_digit(substr($str, 1))
		);
}

$method = [
	'/services/lookup/autocomplete/json' => [
		'query' => function() { return TRUE; },
	],
	'/services/passageInfo/stopPassages/stop' => [
		'stop' => 'ctype_alnum',
		'mode' => function($mode) { return in_array($mode, ['arrival', 'departure']); },
		#'startTime' => 'ctype_digit',
		#'timeFrame' => 'ctype_digit',
	],
	'/services/passageInfo/stopPassages/stopPoint' => [
		'stopPoint' => 'is_number',
		'mode' => function($mode) { return in_array($mode, ['arrival', 'departure']); },
		#'startTime' => 'ctype_digit',
		#'timeFrame' => 'ctype_digit',
	],
	'/services/tripInfo/tripPassages' => [
		'tripId' => 'ctype_digit',
		'mode' => function($mode) { return in_array($mode, ['arrival', 'departure']); },
		#'vehicleId' => 'ctype_digit',
	],
	'/services/routeInfo/routeStops' => [
		'routeId' => 'ctype_alnum',
	],
	'/services/stopInfo/stop' => [
		'stop' => 'is_number',
	],
	'/services/stopInfo/stopPoint' => [
		'stopPoint' => 'is_number',
	],
	
	'/geoserviceDispatcher/services/stopinfo/stops' => [
		'left' => 'is_number',
		'bottom' => 'is_number',
		'right' => 'is_number',
		'top' => 'is_number',
	],
	'/geoserviceDispatcher/services/stopinfo/stopPoints' => [
		'left' => 'is_number',
		'bottom' => 'is_number',
		'right' => 'is_number',
		'top' => 'is_number',
	],
	'/geoserviceDispatcher/services/pathinfo/route' => [
		'id' => 'is_number',
		'direction' => 'is_number',
	],
	'/geoserviceDispatcher/services/pathinfo/vehicle' => [
		'id' => 'is_number',
	],
	'/geoserviceDispatcher/services/vehicleinfo/vehicles' => [
		'lastUpdate' => 'ctype_digit',
		'positionType' => function($type) { return in_array($type, ['CORRECTED', 'RAW']); },
		'colorType' => function($type) { return in_array($type, ['ROUTE_BASED']); },
	],
];
$rewrite = [
	'/lookup/autocomplete/json' => '/services/lookup/autocomplete/json',
	'/passageInfo/stopPassages/stop' => '/services/passageInfo/stopPassages/stop',
	'/routeInfo/routeStops' => '/services/routeInfo/routeStops',
	'/internetservice/geoserviceDispatcher/services/pathinfo/vehicle' => '/geoserviceDispatcher/services/pathinfo/vehicle',
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
if(!$result OR substr($http_response_header[0], 0, 13) != 'HTTP/1.1 200 ') {
	header('HTTP/1.1 503 Service Unavailable');
	if(isset($http_response_header[0])) {
		die($http_response_header[0]);
	} else {
		die('Unknown error');
	}
}

header('Content-Type: application/json');
echo $result;
