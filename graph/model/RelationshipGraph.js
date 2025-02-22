/*
  RelationshipGraph represents a graph of PersonNodes connected via FamilyNodes.
    It includes the genealogical information, but not the display layout.
  Members:
    gx - GedcomX document that this RelationshipGraph is derived from.
    personNodes: array of PersonNode objects for all the persons in the graph.
    familyNodes: array of FamilyNode objects for all the families in the graph.
    personMap: map of personId -> PersonNode
    familyMap: map of familyId -> FamilyNode
  Methods:
    getPerson(personId) - Return PersonNode for that personId
    getFamily(familyId) - Return FamilyNode for that familyId
 */

function addPersonNodes(graph) {
  if (graph.gx.persons) {
    for (let p = 0; p < graph.gx.persons.length; p++) {
      let personNode = new PersonNode(graph.gx.persons[p]);
      graph.personNodes[p] = personNode;
      graph.personNodeMap[personNode.personId] = personNode;
      if (graph.gx.persons[p].principal) {
        graph.principals.push(personNode);
      }
    }
  }
}

// Take a reference like "#p_1" or "http.../XXXX-YYY?blah" and return the person ID from it, i.e., "p_1" or "XXXX-YYY". If it is empty, return null.
function getPersonIdFromReference(ref) {
  if (ref && ref.resource && ref.resource.length > 0) {
    if (ref.resource.substring(0, 1) === "#") {
      return ref.resource.substring(1);
    }
    else {
      // Remove "?" and anything after it.
      let noParams = ref.resource.replace(/\?.*/, "");
      // Strip everything up to last "/", and then up to last ":" to go from "https://familysearch.org/ark:/61903/1:1:XXXX-YYY" to "1:1:XXXX-YYY" to "XXXX-YYY".
      // Also handle "https://familysearch.org/platform/records/personas/XXXX-YYY" (i.e., no "1:1:").
      return noParams.replace(/.*\//, "").replace(/.*:/, "");
    }
  }
  return null;
}

// Create a new FamilyNode and add it to the graph (i.e., to its array of familyNodes[] and to its familyMap).
function addFamily(graph, familyId, fatherNode, motherNode, coupleRelationship) {
  let familyNode = new FamilyNode(familyId, fatherNode, motherNode, coupleRelationship);
  graph.familyNodes.push(familyNode);
  graph.familyNodeMap[familyNode.familyId] = familyNode;
  return familyNode;
}

// Tell whether the genders of the father and mother need to be swapped.
function wrongGender(father, mother) {
  let guy = father ? father.gender : GENDER_CODE_UNKNOWN;
  let gal = mother ? mother.gender : GENDER_CODE_UNKNOWN;
  return (guy !== GENDER_CODE_MALE && gal === GENDER_CODE_MALE) ||
      (guy === GENDER_CODE_FEMALE && gal !== GENDER_CODE_FEMALE);
}

/**
 * Add a FamilyNode for each couple relationship in the given GedcomX document.
 */
function addCouples(graph) {
  if (graph.gx.relationships) {
    for (let rel of graph.gx.relationships) {
      if (rel.type === GX_COUPLE) {
        let pid1 = getPersonIdFromReference(rel.person1);
        let pid2 = getPersonIdFromReference(rel.person2);
        let fatherNode = graph.personNodeMap[pid1];
        let motherNode = graph.personNodeMap[pid2];
        if (wrongGender(fatherNode, motherNode)) {
          // Swap persons to make p1 the father and p2 the mother, if possible.
          let temp = fatherNode;
          fatherNode = motherNode;
          motherNode = temp;
        }
        addFamily(graph, makeFamilyId(graph.chartId, fatherNode, motherNode), fatherNode, motherNode, rel);
      }
    }
  }
}

// Get a map of personId -> list of objects that contain parentId (of one of that person's parents) and parentChildRelationship (from the GedcomX) for that parent.
function getParentMap(graph) {
  let parentMap = {};

  if (graph.gx.relationships) {
    for (let rel of graph.gx.relationships) {
      if (rel.type === GX_PARENT_CHILD) {
        let parentId = getPersonIdFromReference(rel.person1);
        let childId = getPersonIdFromReference(rel.person2);
        let parentIds = parentMap[childId];
        let parentIdAndRel = {
          parentId: parentId,
          parentChildRelationship: rel
        };
        if (parentIds) {
          // Add object to end of array, which is already in the map
          parentIds.push(parentIdAndRel);
        }
        else {
          // Create a new array with this one element and add it to the map.
          parentMap[childId] = [parentIdAndRel];
        }
      }
    }
  }
  return parentMap;
}

// Modify the given array by removing the first occurrence of the given value, if any.
function removeFromArray(value, array) {
  for (let i = 0; i < array.length; i++) {
    if (array[i] === value) {
      array.splice(i, 1);
      return;
    }
  }
}

// Add children to the existing FamilyNodes in the graph.
function addChildren(graph) {
  // get a map of childId -> array of parent IDs.
  let parentMap = getParentMap(graph);

  for (let childNode of graph.personNodes) {
    // For each person, get their list of parents. For each parent, see if there is a FamilyNode with that parent and any other in the list.
    // If so, add this person as a child to that family, and remove both parents from the list.
    // If not, find or create a single-parent family with that parent and add this child to it.
    // Array of objects with {personId, parentChildRelationship}
    let parentIdsAndRels = parentMap[childNode.personId];
    if (parentIdsAndRels && parentIdsAndRels.length > 0) {
      let unusedParentIdsAndRels = parentIdsAndRels.slice();
      for (let parent1 = 0; parent1 < parentIdsAndRels.length; parent1++) {
        for (let parent2 = parent1 + 1; parent2 < parentIdsAndRels.length; parent2++) {
          let fatherNode = graph.getPerson(parentIdsAndRels[parent1].parentId);
          let motherNode = graph.getPerson(parentIdsAndRels[parent2].parentId);
          let fatherRel = parentIdsAndRels[parent1].parentChildRelationship;
          let motherRel = parentIdsAndRels[parent2].parentChildRelationship;
          if (wrongGender(fatherNode, motherNode)) {
            // Swap persons to make p1 the father and p2 the mother, if possible.
            let temp = fatherNode;
            fatherNode = motherNode;
            motherNode = temp;
            temp = fatherRel;
            fatherRel = motherRel;
            motherRel = temp;
          }

          let familyId = makeFamilyId(graph.chartId, fatherNode, motherNode);
          let familyNode = graph.getFamily(familyId);
          if (!familyNode) {
            familyId = makeFamilyId(graph.chartId, motherNode, fatherNode); // in case genders were unknown or the same, try swapping to see if that couple exists.
            familyNode = graph.getFamily(familyId);
          }
          if (familyNode) {
            familyNode.addChild(childNode, fatherRel, motherRel);
            removeFromArray(parentIdsAndRels[parent1], unusedParentIdsAndRels);
            removeFromArray(parentIdsAndRels[parent2], unusedParentIdsAndRels);
          }
        }
      }
      // If any parents were not part of a couple, create a single-parent family for them.
      for (let unusedParent of unusedParentIdsAndRels) {
        let fatherNode = graph.personNodeMap[unusedParent.parentId];
        let motherNode = null;
        let fatherRel = unusedParent.parentChildRelationship;
        let motherRel = null;
        if (wrongGender(fatherNode, motherNode)) {
          motherNode = fatherNode;
          fatherNode = null;
          motherRel = fatherRel;
          fatherRel = null;
        }
        let familyId = makeFamilyId(graph.chartId, fatherNode, motherNode);
        let familyNode = graph.getFamily(familyId);
        if (!familyNode) {
          familyNode = addFamily(graph, familyId, fatherNode, motherNode); // single parent, so no couple relationship
        }
        familyNode.addChild(childNode, fatherRel, motherRel);
      }
    }
  }
}

function addFamiliesToPersonNodes(graph) {
  for (let familyNode of graph.familyNodes) {
    if (familyNode.father) {
      familyNode.father.addSpouseFamily(familyNode);
    }
    if (familyNode.mother) {
      familyNode.mother.addSpouseFamily(familyNode);
    }
    if (familyNode.children) {
      for (let child of familyNode.children) {
        child.addParentFamily(familyNode);
      }
    }
  }
}

RelationshipGraph.prototype.relTypeMap = {
  "Couple": ["Husband", "Wife", "Spouse"],
  "ParentChild": ["Father", "Mother", "Parent", "Son", "Daughter", "Child"],
  "StepParentChild": ["Stepfather", "Stepmother", "Stepparent", "Stepson", "Stepdaughter", "Stepchild"],
  "ParentChildInLaw": ["Father-in-law", "Mother-in-law", "Parent-in-law", "Son-in-law", "Daughter-in-law", "Child-in-law"],
  "SurrogateParentChild": ["Surrogate father", "Surrogate mother", "Surrogate parent", "Surrogate son", "Surrogate daughter", "Surrogate child"],
  "AuntOrUncle": ["Uncle", "Aunt", "Aunt Or Uncle", "Nephew", "Niece", "Niece Or Nephew"],
  "Godparent": ["Godfather", "Godmother", "Godparent", "Godson", "Goddaughter", "Godchild"],
  "Sibling": ["Brother", "Sister", "Sibling"],
  "Fiance": ["Fiancé", "Fiancée", "Fiancé"], // female Fiancée has an extra "e"
  "Grandparent": ["Grandfather", "Grandmother", "Grandparent", "Grandson", "Granddaughter", "Grandchild"],
  "GreatGrandparent": ["Great-grandfather", "Great-grandmother", "Great-grandparent", "Great-grandson", "Great-granddaughter", "Great-grandchild"],
  "SiblingInLaw": ["Brother-in-law", "Sister-in-law", "Sibling-in-Law"],
  "StepSibling": ["Stepbrother", "Stepsister", "Stepsibling"],
  "AncestorDescendant": ["Ancestor", "Ancestor", "Ancestor", "Descendant", "Descendant", "Descendant"]
};

/**
 * Get the label for the given relationship URI, given the relative's gender, and whether the relative is P1 or not.
 *   In a "Grandparent" relationship, "P1 is the Grandparent of P2", so the default behavior is to return Grandparent, Grandfather or Grandmother,
 *   depending on the relativeGender, where P1 is the "relative" (of P2).
 *   When isReverse is set, then P2 is the "relative" (of P1), and we return Grandchild, Grandson or Granddaughter, depending on relativeGender.
 * @param relationshipUri - Relationship type URI, e.g., "http://gedcomx.org/ParentChild" or "http://gedcomx.org/Grandparent"
 * @param relativeGender - Gender URI of the relative, e.g., "http://gedcomx.org/Male"
 * @param isReverse - Flag for whether to reverse the relationship (e.g., use Grandchild for a Grandparent relationship)
 * @returns Label for the reltationship. (e.g., "Grandson")
 */
function getRelativeLabelFromRelationship(relationshipUri, relativeGender, isReverse) {
  let relationshipName = relationshipUri.replace(/.*\//, ""); // strip everything until final "/" to get base name of the relationship
  let genderSpecific = RelationshipGraph.prototype.relTypeMap[relationshipName];
  let relativeLabel;
  if (genderSpecific && genderSpecific.length > 3) {
    relativeLabel = getRelativeLabel(relativeGender, genderSpecific[0], genderSpecific[1], genderSpecific[2], isReverse, genderSpecific[3], genderSpecific[4], genderSpecific[5]);
  }
  else if (genderSpecific) {
    relativeLabel = getRelativeLabel(relativeGender, genderSpecific[0], genderSpecific[1], genderSpecific[2]);
  }
  else {
    relativeLabel = parseType(relationshipUri);
  }
  return relativeLabel;
}

/**
 * Get a label for a relative based on gender. If isReverse is included and is true, then use the reverse labels.
 * @param gender - Gender of the relative
 * @param maleType - Label to use if the relative is male
 * @param femaleType - Label to use if the relative is female
 * @param neutralType - Label to use if the relative's gender is unknown
 * @param isReverse - Flag for whether to use the reverse labels (below) instead
 * @param maleTypeReverse - Label to use if the relative is male, and we're looking at it from person2's point of view.
 * @param femaleTypeReverse - similar
 * @param neutralTypeReverse - similar
 * @returns Label to use for the relationship, given the gender and which person's point of view is being used.
 */
function getRelativeLabel(gender, maleType, femaleType, neutralType, isReverse, maleTypeReverse, femaleTypeReverse, neutralTypeReverse) {
  if (isReverse) {
    return getRelativeLabel(gender, maleTypeReverse, femaleTypeReverse, neutralTypeReverse);
  }
  else if (gender === "http://gedcomx.org/Male") {
    return maleType;
  }
  else if (gender === "http://gedcomx.org/Female") {
    return femaleType;
  }
  return neutralType;
}

function addOtherRelationshipsToPersonNodes(graph) {
  if (graph.gx.relationships) {
    for (let rel of graph.gx.relationships) {
      if (rel.type !== GX_COUPLE  && rel.type !== GX_PARENT_CHILD) {
        // Other relationship type: We will not use it to display the relationship graph, but do want to include it as a "relative" in the PersonBox.
        let pid1 = getPersonIdFromReference(rel.person1);
        let pid2 = getPersonIdFromReference(rel.person2);
        let personNode1 = graph.personNodeMap[pid1];
        let personNode2 = graph.personNodeMap[pid2];
        let gender1 = personNode1.person.gender ? personNode1.person.gender.type : null;
        let gender2 = personNode2.person.gender ? personNode2.person.gender.type : null;
        personNode1.addRelative(getRelativeLabelFromRelationship(rel.type, gender2, true), personNode2);
        personNode2.addRelative(getRelativeLabelFromRelationship(rel.type, gender1, false), personNode1);
      }
    }
  }
}

function addFamilyNodes(graph) {
  addCouples(graph);
  addChildren(graph);
  addFamiliesToPersonNodes(graph);
  addOtherRelationshipsToPersonNodes(graph);
}

RelationshipGraph.prototype.getPerson = function(personId) {
  return this.personNodeMap[personId];
};

RelationshipGraph.prototype.getFamily = function(familyId) {
  return this.familyNodeMap[familyId];
};

RelationshipGraph.prototype.removeFamilyNode = function(familyNode) {
  let index = this.familyNodes.indexOf(familyNode);
  if (index >= 0) {
    this.familyNodes.splice(index, 1);
  }
  delete this.familyNodeMap[familyNode.familyId];
};

/*** Constructor ***/
function RelationshipGraph(gx, chartId) {
  if (!chartId) {
    chartId = RelationshipGraph.nextGraphId++;
  }

  this.gx = gx; // GedcomX document (record or portion of a tree).
  this.chartId = chartId;
  this.personNodes = []; // array of PersonNode
  this.familyNodes = []; // array of FamilyNode
  this.personNodeMap = {}; // map of personId to PersonNode
  this.familyNodeMap = {}; // map of familyId to FamilyNode
  this.principals = []; // array of principal PersonNodes
  addPersonNodes(this);
  addFamilyNodes(this);
}

RelationshipGraph.nextGraphId = 1;
