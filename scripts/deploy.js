/* global ethers */
/* eslint prefer-const: "off" */

const { getSelectors, FacetCutAction } = require("./libraries/diamond.js");
const toWei = (num) => ethers.utils.parseEther(num.toString());
const fromWei = (num) => ethers.utils.formatEther(num);

async function deployDiamond() {
  const [contractOwner, partner1, partner2] = await ethers.getSigners();

  // Deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded or deployed to initialize state variables
  // Read about how the diamondCut function works in the EIP2535 Diamonds standard
  const DiamondInit = await ethers.getContractFactory("DiamondInit");
  const diamondInit = await DiamondInit.deploy();
  await diamondInit.deployed();
  console.log("DiamondInit deployed:", diamondInit.address);

  // Deploy facets and set the `facetCuts` variable
  console.log("");
  console.log("Deploying facets");
  const FacetNames = [
    "DiamondCutFacet",
    "DiamondLoupeFacet",
    "OwnershipFacet",
    "DistributorFacet",
  ];
  // The `facetCuts` variable is the FacetCut[] that contains the functions to add during diamond deployment
  const facetCuts = [];
  for (const FacetName of FacetNames) {
    const Facet = await ethers.getContractFactory(FacetName);
    const facet = await Facet.deploy();
    await facet.deployed();
    console.log(`${FacetName} deployed: ${facet.address}`);
    facetCuts.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facet),
    });
  }

  // Creating a function call
  // This call gets executed during deployment and can also be executed in upgrades
  // It is executed with delegatecall on the DiamondInit address.
  let functionCall = diamondInit.interface.encodeFunctionData("init");

  // Setting arguments that will be used in the diamond constructor
  const diamondArgs = {
    owner: contractOwner.address,
    init: diamondInit.address,
    initCalldata: functionCall,
    beneficiary1: partner1.address,
    beneficiary2: partner2.address,
    beneficiaryStake1: 70,
    beneficiaryStake2: 30,
  };

  // deploy Diamond
  const Diamond = await ethers.getContractFactory("Diamond");
  const diamond = await Diamond.deploy(facetCuts, diamondArgs);
  await diamond.deployed();
  console.log();
  console.log("Diamond deployed:", diamond.address);

  //Interact with the diamond to initialize Distributor
  const distributorFacet = await ethers.getContractAt(
    "DistributorFacet",
    diamond.address
  );

  const stake1 = await distributorFacet.getBeneficiary1Stake();
  const stake2 = await distributorFacet.getBeneficiary2Stake();
  console.log("Stake1 is", stake1);
  console.log("Stake2 is", stake2);

  await distributorFacet.receiveAndDistributePayment({ value: toWei(10) });
  const partner1FinalBalance = await partner1.getBalance();
  const partner2FinalBalance = await partner2.getBalance();

  console.log("Partner1 final balance is", fromWei(partner1FinalBalance));
  console.log("Partner2 final balance is", fromWei(partner2FinalBalance));
  // returning the address of the diamond
  return diamond.address;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployDiamond()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployDiamond = deployDiamond;
