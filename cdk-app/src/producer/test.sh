
#!/bin/bash

terminateEc2() {
    echo "Terminating the vm instance" "$test"
}

test = $(echo "nonlocal variable")
echo "hello"