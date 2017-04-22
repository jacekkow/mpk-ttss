document.RouteModule = function (route_source) {
    var target = null;

    function drawRoute(route) {
        route_source.clear();

        for (var stepIndex in route.steps) {
            var step = route.steps[stepIndex];

            var points = [[step.start_location.lng, step.start_location.lat], [step.end_location.lng, step.end_location.lat]];

            for (var i = 0; i < points.length; i++) {
                points[i] = ol.proj.transform(points[i], 'EPSG:4326', 'EPSG:3857');
            }

            var feature = new ol.Feature({
                geometry: new ol.geom.LineString(points)
            });

            feature.setStyle(new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: 'red',
                    width: 4
                })
            }));

            route_source.addFeature(feature);
        }
    }

    function receiveRoute(route) {
        drawRoute(route.routes[0].legs[0]);
    }

    function receiveLocation(location) {
        console.log("Location", location);
        if (target != null) {
            $.get("route.php", {
                "origin": location.coords.latitude + "," + location.coords.longitude,
                "destination": target
            }, receiveRoute);
        }
    }

    function showLocationError(error) {
        console.error("Cannot get location", error);
    }

    function getLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(receiveLocation, showLocationError);
        } else {
            console.error("Location API is not supported in this browser.");
        }
    }

    this.setTarget = function (targetSelector) {
        target = targetSelector;
        console.log("Target set to", targetSelector);
    }

    $(document).ready(function () {
        getLocation();
        console.log("Route module ready.");
    });
}





