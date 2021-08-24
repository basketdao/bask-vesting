#!/bin/bash

for i in {3..10}
do 
    yarn generate-merkle-root -i scripts/output/week${i}.json > ./scripts/merkle-data/week${i}.json
done
