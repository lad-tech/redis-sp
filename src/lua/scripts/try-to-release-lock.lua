local resource_key = KEYS[1]

local owner_id = ARGV[1]

local resource_owner_id = redis.call('GET', resource_key)

-- Delete the key if it belongs to this owner
if owner_id == resource_owner_id then
  return redis.call('DEL', resource_key)
end

return 0
