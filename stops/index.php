<?php
include('common.php');
include('stops.php');

try {
	// Reject invalid input
	if(!isset($_GET['query'])) throw new UnexpectedValueException();
	if(empty($_GET['query'])) throw new UnexpectedValueException();
	if(strlen($_GET['query']) > 50) throw new UnexpectedValueException();
	
	// Split stop name into words
	$words = split_stop_name($_GET['query']);
	$find_ondemand = in_array('nz', $words);
	
	// Initialize a DB connection and a query
	$pdo = new PDO('sqlite:stops.db', NULL, NULL, array(
		PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
	));
	$st = $pdo->prepare('SELECT DISTINCT id FROM stop_search WHERE word LIKE ?'.($find_ondemand ? '' : ' AND word != \'nz\'').' ORDER BY id DESC');
	
	// Find matching stops (their IDs)
	$ids = NULL;
	foreach($words as $word) {
		if(empty($word)) continue;
		
		// Find stop IDs with names matching the word
		$st->execute(array($word.'%'));
		$results = $st->fetchAll(PDO::FETCH_COLUMN);
		$st->closeCursor();
		
		if(is_array($ids)) {
			// Merge results with list for previous words
			$ids = array_intersect($ids, $results);
		} else {
			// First search - initialize results list
			$ids = $results;
		}
		
		// No results will be found
		if(count($ids) == 0) break;
	}
	
	// Close a DB connection
	unset($st, $pdo);
	
	// No query was executed - return empty list
	if(!is_array($ids)) throw new UnexpectedValueException();
	
	// Build a structure for the UI
	$stop_list = [];
	$query_lower = normalize_name_cmp($_GET['query']);
	foreach($ids as $id) {
		$letters = similar_text(
			$query_lower,
			normalize_name_cmp($stops[$id]),
			$percent
		);
		$percent += $letters * 100;
		// -5 due to UTF-8
		if(substr($stops[$id], -5) == '(nż)' && !$find_ondemand) {
			$percent /= 2;
		}
		$stop_list[] = [
			'id' => $id,
			'name' => normalize_name($stops[$id]),
			'type' => 'stop',
			'relevance' => $percent,
		];
	}
	
	// Sort stops by relevance
	usort($stop_list, function($a, $b) {
		$rel = $b['relevance'] - $a['relevance'];
		if($rel == 0) return strcasecmp($a['name'], $b['name']);
		return $rel;
	});
	
	// Return JSON
	header('Content-Type: application/json');
	echo json_encode($stop_list);
} catch(UnexpectedValueException $e) {
	header('Content-Type: application/json');
	echo '[]';
} catch(Exception $e) {
	header('HTTP/1.1 503 Service Unavailable');
	echo $e->getMessage();
}
