<?php
if(php_sapi_name() !== 'cli') die();

$chars = 'aąbcćdeęfghijklłmnńoóprsśtuvwxyzżź0123456789';
$len = mb_strlen($chars);

$replacements = [
	'&Oacute;' => 'Ó',
	'&oacute;' => 'ó',
	'&Eacute;' => 'É',
	'&eacute;' => 'é',
];

$stops = [];
for($i = 0; $i < $len; $i++) {
	for($j = 0; $j < $len; $j++) {
		$char = mb_substr($chars, $i, 1).mb_substr($chars, $j, 1);
		$json = file_get_contents('http://www.ttss.krakow.pl/internetservice/services/lookup/autocomplete/json?query='.urlencode($char));
		$elements = json_decode($json, 1);
		foreach($elements as $element) {
			if($element['type'] == 'divider') continue;
			if($element['type'] == 'route') continue;
			if($element['type'] != 'stop') {
				throw new Exception('Unknown element: '.var_export($element, 1));
			}
			
			$stops[$element['id']] = strtr($element['name'], $replacements);
		}
	}
}

asort($stops);
var_export($stops);
