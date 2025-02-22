/*
  RelationshipChart: Represents a graphical display of a relationship graph, including PersonBox and FamilyLine objects and their positions.
 */

/**
 * Constructor of ChartOptions
 * @param prevChart - Previous chart to use in knowing where to animate new boxes from.
 * @param imgOverlayToGx - Object that maps the image overly divs to corresponding GedcomX objects
 * @param ignoreUndo - Flag for whether to ignore undo (i.e., true => don't create an undo log)
 *
 * @param isEditable - Flag for whether the chart is editable
 * @param isDraggable - Flag for whether to allow the RelChart to be draggable.
 * @param shouldCompress - Flag for whether to compress the chart vertically. (Default = true)
 * @param shouldDisplayDetails - Flag for whether to display person details (i.e., facts). Default = true;
 * @param shouldShowConfidence - Flag for whether to display the name, date and place confidence (when present)
 * @param shouldDisplayIds - Flag for whether to display person IDs
 * @constructor
 */
function ChartOptions({ prevChart= null,
                        imgOverlayToGx= null,
                        ignoreUndo= false,
                        isEditable= false,
                        isDraggable= false,
                        shouldCompress = true,
                        shouldDisplayDetails = true,
                        shouldShowConfidence = false,
                        shouldDisplayIds = false
                      } = {}) {

  this.prevChart = prevChart;
  this.imgOverlayToGx = imgOverlayToGx;
  this.ignoreUndo = ignoreUndo;

  this.isEditable = isEditable;
  this.isDraggable = isDraggable;
  this.shouldShowConfidence = shouldShowConfidence;
  this.shouldDisplayIds = shouldDisplayIds;
  this.shouldDisplayDetails = shouldDisplayDetails;
  this.shouldCompress = shouldCompress;
}

function prevRelChartOptions(prevRelChart, imgOverlayToGx) {
  return new ChartOptions({
    prevChart : prevRelChart,
    imgOverlayToGx: imgOverlayToGx,
    ignoreUndo: prevRelChart.ignoreUndo,
    isEditable: prevRelChart.isEditable,
    isDraggable: prevRelChart.isDraggable,
    shouldCompress: prevRelChart.shouldCompress,
    shouldDisplayDetails: prevRelChart.shouldDisplayDetails,
    shouldShowConfidence: prevRelChart.shouldShowConfidence,
    shouldDisplayIds: prevRelChart.shouldDisplayIds
  });
}

// Tell whether personBox1 has a spouse that is not personBox2, or vice-versa
RelationshipChart.prototype.hasDifferentSpouse = function(personBox1, personBox2) {
  if (personBox1 && personBox2) {
    let person1 = personBox1.personNode;
    let person2 = personBox2.personNode;
    if (!isEmpty(person1.spouseFamilies)) {
      for (let spouseFamily of person1.spouseFamilies) {
        if (spouseFamily.getSpouse(person1) === person2) {
          return false;
        }
      }
      return true;
    }
    else if (!isEmpty(person2.spouseFamilies)) {
      for (let spouseFamily of person2.spouseFamilies) {
        if (spouseFamily.getSpouse(person2) === person1) {
          return false;
        }
      }
      return true;
    }
  }
  return false;
};

RelationshipChart.prototype.getAnimationSpeed = function() {
  return this.animationSpeed;
}

RelationshipChart.prototype.hasRelatives = function(personBox) {
  return !isEmpty(personBox.parentLines) || !isEmpty(personBox.spouseLines);
};

RelationshipChart.prototype.subtreeGap = function(above, below) {
  if (above && below && above.generation === below.generation && (this.hasRelatives(above) || this.hasRelatives(below))) {
    // Put a small vertical gap between different subtrees
    if (below.subtree !== above.subtree) {
      return this.treeGap;
    }
    // Also put a small vertical gap between a couple and adjacent siblings.
    if (this.hasDifferentSpouse(below, above)) {
      return this.treeGap;
    }
  }
  return 0;
};

/**
 * Create a map of Generation to the array of spouse FamilyLines to the left of that generation (sorted by "top" coordinate).
 * @param familyLines - Array of FamilyLines to put into the returned map.
 * @return array (one entry per generation) of arrays of FamilyLines in that generation.
 */
RelationshipChart.prototype.makeGenerationLinesList = function(familyLines) {
  // Create a map of Generation -> set of family lines in that generation
  let generationLinesList = []; // FamilyLines in each generation: [generation#][]
  for (let generationNumber = 0; generationNumber < this.generations.length; generationNumber++) {
    generationLinesList[generationNumber] = [];
  }
  for (let familyLine of familyLines) {
    let generationNumber = familyLine.getParentGenerationIndex();
    generationLinesList[generationNumber].push(familyLine);
  }
  // Sort the lines in each generation's list by the top coordinate.
  for (let generationNumber = 0; generationNumber < this.generations.length; generationNumber++) {
    generationLinesList[generationNumber].sort(FamilyLine.prototype.compare);
  }
  return generationLinesList;
};

// Cause HTML elements to move to their new positions.
RelationshipChart.prototype.setPositions = function() {
  let bottom = 0;
  for (let personBox of this.personBoxes) {
    if (personBox.hasMoved()) {
      personBox.setPosition();
    }
    if (personBox.getBelow() > bottom) {
      bottom = personBox.getBelow();
    }
  }
  for (let familyLine of this.familyLines) {
    if (familyLine.hasMoved()) {
      familyLine.setPosition();
    }
  }
  this.$personsDiv.height(bottom + 4);
};

RelationshipChart.prototype.getGedcomX = function() {
  return this.relGraph.gx;
};

RelationshipChart.prototype.calculatePositions = function() {
  let y = 0;
  let prevBox = null;
  let bottom;

  // Remember current size so that if person's info has changed, the box can be animated to the right size.
  this.prevHeight = this.height;

  // Put every person in their own horizontal row to begin with.
  for (let personBox of this.personBoxes) {
    personBox.setPreviousPosition();
    y += this.verticalGap + this.subtreeGap(prevBox, personBox);
    personBox.top = y;
    y += personBox.height + this.personBorder;
    personBox.bottom = y;
    personBox.center = personBox.top + (personBox.height / 2);
    prevBox = personBox;
  }

  // Move persons closer together until they either (a) touch the person above or below them, or (b) come within
  // 1/2 box height of their nearest child or parent.
  if (this.shouldCompress) {
    this.chartCompressor.compressGraph(this.personBoxes);
  }

  // Get the new bottom of the graph
  y = 0;
  for (let personBox of this.personBoxes) {
    bottom = personBox.getBelow();
    if (bottom > y) {
      y = bottom;
    }
  }
  this.height = y + 4;

  let generationLinesList = this.makeGenerationLinesList(this.familyLines);

  let x = 4; // pad by 4 just so the first line isn't right up against the edge of the screen.
  for (let g = 0; g < this.generations.length; g++) {
    // Set the x-coordinate of each familyLine for the given generation. Return the resulting x-coordinate, which may have increased
    //   if there are overlapping lines within the same generation.
    x = FamilyLine.prototype.setLineX(generationLinesList[g], x, this.lineGap);
    this.generations[g].left = x;
    if (!isEmpty(this.generations[g].genPersons)) {
      x += this.generationWidth + this.lineGap;
    }
  }
  this.width = x + 4;
};

/**
 * Immediately move person boxes and family lines to where they were in the previous chart (before a record update)
 *   so that when we animate to the new positions, we avoid any sudden jump.
 * Uses the prevRelChart to find the position of each person's box and family's line in the previous chart.
 * Any new person boxes or family lines are placed above, below, or between previous ones so they animate from somewhere nearby.
 * @param prevRelChart
 */
RelationshipChart.prototype.setPreviousPositions = function(prevRelChart) {
  let newPersons = new LinkedHashSet();
  for (let personBox of this.personBoxes) {
    let prevPersonBox = prevRelChart.personBoxMap[personBox.personBoxId];
    if (prevPersonBox) {
      let prevLeft = prevPersonBox.prevLeft ? prevPersonBox.prevLeft : prevPersonBox.getLeft();
      personBox.$personDiv.css({left: prevLeft, top: prevPersonBox.getTop()});
    }
    else {
      newPersons.add(personBox.personNode.personId);
    }
  }
  for (let familyLine of this.familyLines) {
    let prevFamilyLine = prevRelChart.familyLineMap[familyLine.familyNode.familyId];
    if (prevFamilyLine) {
      let height = 1 + prevFamilyLine.bottomPerson.center - prevFamilyLine.topPerson.center;
      familyLine.$familyLineDiv.css({left: prevFamilyLine.x + "px", top: prevFamilyLine.topPerson.center + "px", height: height + "px"});
      if (familyLine.$familyLineDrop) { // => isEditable
        familyLine.$familyLineDrop.css({height: height + "px"});
      }
      let width;
      if (familyLine.$fatherLineDiv) {
        width = prevFamilyLine.safeWidth(prevFamilyLine.father.getLeft() - prevFamilyLine.x);
        familyLine.$fatherLineDiv.css({"left": prevFamilyLine.x, "top": prevFamilyLine.father.center + "px", "width": width + "px"});
      }
      if (familyLine.$motherLineDiv) {
        width = prevFamilyLine.safeWidth(prevFamilyLine.mother.getLeft() - prevFamilyLine.x);
        familyLine.$motherLineDiv.css({"left": prevFamilyLine.x, "top": prevFamilyLine.mother.center + "px", "width": width + "px"});
      }
      for (let c = 0;  c < familyLine.children.length; c++) {
        let childPersonBox = familyLine.children[c];
        let prevChildBox = prevRelChart.personBoxMap[childPersonBox.personBoxId];
        if (prevChildBox) {
          width = prevFamilyLine.safeWidth(prevFamilyLine.x - prevChildBox.getRight());
          familyLine.$childrenLineDivs[c].css({"left": prevChildBox.getRight(), "top": prevChildBox.center, "width": width});
          familyLine.$childrenLineDots[c].css({"left": prevChildBox.getRight() + width - familyLine.dotWidth / 2, "top": prevChildBox.center - familyLine.dotHeight / 2});
          if (familyLine.$childrenX) { // => isEditable
            familyLine.$childrenX[c].css({"left": prevFamilyLine.x - prevFamilyLine.xSize, "top": prevChildBox.center - prevFamilyLine.xSize / 2});
          }
        }
      }
    }
  }
};

/**
 * Constructor. Creates an empty RelationshipChart. Needs to be built up using RelChartBuilder.buildChart()
 * @param relGraph - RelationshipGraph to represent in the RelationshipChart
 * @param $relChartDiv - JQuery object for the "rel-chart div
 * @param chartOptions - chart options (see ChartOptions):
 *        prevChart= null, imgOverlayToGx= null, ignoreUndo= false, isEditable= false, isDraggable= false,
 *        shouldCompress = true, shouldDisplayDetails = true, shouldShowConfidence = false, shouldDisplayIds = false
 * @constructor
 */
function RelationshipChart(relGraph, $relChartDiv, chartOptions) {

  this.relGraph = relGraph;
  this.isEditable = chartOptions.isEditable;
  this.chartId = this.relGraph.chartId;
  $relChartDiv.empty();
  $relChartDiv.append($.parseHTML(`<div id='personNodes-${this.chartId}'></div>\n<div id='familyLines-${this.chartId}'></div>\n<div id='editControls-${this.chartId}'></div>`));
  this.$personsDiv = $(`#personNodes-${this.chartId}`);
  this.$familyLinesDiv = $(`#familyLines-${this.chartId}`);
  this.$editControlsDiv = $(`#editControls-${this.chartId}`);
  this.personBoxes = []; // array of all PersonBoxes in the relationship chart, positioned top to bottom
  this.generations = []; // array of Generations that the persons are in, left to right
  this.familyLines = []; // array of family lines

  this.personBoxMap = {}; // map of personBoxId to their corresponding PersonBox
  this.familyLineMap = {}; // map of familyId to its corresponding FamilyLine object
  this.personDupCount = {}; // map of personId to how many duplicates have been seen so far (null/undefined => 0).

  // Display options
  this.personBorder = 6; // pixels spread between the top and bottom, around the text (/2 = border space)
  this.verticalGap = 4; // min. pixels between two boxes in the same generation
  this.generationGap = 10; // min. pixels between a parent and child
  this.generationWidth = 280; // Width of a PersonBox (not including additional padding).
  this.lineGap = 10; // Horizontal pixels between one vertical line and another; and between a PersonBox and the vertical line.
  this.treeGap = 10; // Additional vertical pixels between someone in one connected tree and another one.
  this.shouldIncludeDetails = chartOptions.shouldIncludeDetails;
  this.shouldCompress = chartOptions.shouldCompress;
  this.shouldDisplayIds = chartOptions.shouldDisplayIds;
  this.shouldShowConfidence = chartOptions.shouldShowConfidence;
  this.animationSpeed = 0;

  this.width = 0; // overall size of chart
  this.height = 0;
  this.prevHeight = 0; // height of chart before last update
  this.chartCompressor = new ChartCompressor(this);

  if (chartOptions.isEditable) {
    let relChart = this;
    $relChartDiv.click(function(){
      relChart.clearSelections();
    });
    this.selectedFamilyLine = null;
    this.selectedPersonBoxes = [];
  }
}
