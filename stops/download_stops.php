<?php
if(php_sapi_name() !== 'cli') die();

$json = file_get_contents('http://www.ttss.krakow.pl/internetservice/geoserviceDispatcher/services/stopinfo/stops?left=-648000000&bottom=-324000000&right=648000000&top=324000000');
$elements = json_decode($json, 1);
foreach($elements['stops'] as $element) {
	if($element['category'] == 'other') continue;
	$stops[$element['shortName']] = $element['name'];
}

asort($stops);

echo '<?php'."\n";
echo '$stops = array ('."\n";
foreach($stops as $id => $stop) {
	echo '  '.str_pad($id, 4, ' ', STR_PAD_RIGHT).' => '.var_export($stop, TRUE).','."\n";
}
echo ');'."\n";
