<?php
include(__DIR__.'/stops/common.php');
include(__DIR__.'/stops/stops.php');

try {
	// Reject invalid input
	if(!isset($_GET['query'])) throw new UnexpectedValueException();
	if(empty($_GET['query'])) throw new UnexpectedValueException();
	if(strlen($_GET['query']) > 50) throw new UnexpectedValueException();
	
	// Initialize DB connection an query
	$pdo = new PDO('sqlite:stops/stops.db', NULL, NULL, array(
		PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
	));
	$st = $pdo->prepare('SELECT DISTINCT id FROM stop_search WHERE word LIKE ?');
	
	// Split stop name into words
	$words = split_stop_name($_GET['query']);
	
	// Find relevant stop IDs
	$ids = NULL;
	foreach($words as $word) {
		if(empty($word)) continue;
		
		// Find stop IDs with names matching the word
		$st->execute(array($word.'%'));
		$results = $st->fetchAll(PDO::FETCH_COLUMN);
		$st->closeCursor();
		
		// Merge results with previous searches
		if(is_array($ids)) {
			$ids = array_intersect($ids, $results);
		} else {
			$ids = $results;
		}
		
		// No results will be found
		if(count($ids) == 0) break;
	}
	
	// Close DB connection
	unset($st, $pdo);
	
	// No query was executed
	if(!is_array($ids)) throw new UnexpectedValueException();
	
	// Build structure for UI
	$stop_list = [];
	$query_lower = mb_strtolower($_GET['query'], 'UTF-8');
	foreach($ids as $id) {
		$stop_list[] = [
			'id' => $id,
			'name' => $stops[$id],
			'type' => 'stop',
			'relevance' => similar_text(
				$query_lower,
				mb_strtolower($stops[$id], 'UTF-8')
			)
		];
	}
	
	// Sort stops by relevence
	usort($stop_list, function($a, $b) {
		$rel = $b['relevance'] - $a['relevance'];
		if($rel == 0) return strcasecmp($a['name'], $b['name']);
		return $rel;
	});
	
	// Return JSON
	echo json_encode($stop_list);
} catch(UnexpectedValueException $e) {
	echo '[]';
} catch(Exception $e) {
	header('HTTP/1.1 503 Service Unavailable');
	echo $e->getMessage();
}
